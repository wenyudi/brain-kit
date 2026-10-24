'use strict';
// brain find（2026-10-25）：零常驻的全文检索，替代 basic-memory 的 search_notes。
// 每次现算 BM25：拉丁词小写 + 中文按二元切词，标题（文件名）权重 ×3，YAML frontmatter 只取 title/tags。
// 依据：同一套 2026-09-14 冻结题上，agent 先写关键词再用这个算法，designated-source hit@5 = 26/27（三次），
//       修复后的 basic-memory 19/27（~/.local/state/brain/evaluations/2026-10-25-lexical-baseline/）。
// 范围：当前库（BRAIN_ROOT，按 cwd 定库）下所有 .md，跳过点目录与附件目录；--all 搜注册表里每个库（只在用户要跨库时用）。
// 用法：brain find <关键词…> [-n 8] [--all] [--json]
//   关键词中英都写、带上专有名词，效果最好（笔记里中英混写）。没有命中就换个说法再搜，别下结论说没有。
const fs = require('fs'); const path = require('path');

const SKIP_DIRS = new Set(['node_modules', '_attachments', 'assets', 'inbox']);
const MAX_BYTES = 400 * 1024;
const STOP = new Set('the a an of to and or in on for is are was be by with as at it this that from not no do does did my me i you we our your what why how which when where who have has had into than then so if but can will'.split(' '));

// 汉字用 \p{Script=Han}（含扩展区生僻字，按码点切）。文档里每个汉字既出单字也出二元组，
// 这样单字查询（多为生僻人名）能命中；查询里两个字以上的连串只出二元组，保持准确。
function tokens(s, { doc = false } = {}) {
  const out = [];
  for (const m of String(s).toLowerCase().matchAll(/[a-z0-9][a-z0-9._-]*|\p{Script=Han}+/gu)) {
    const w = m[0];
    if (/^\p{Script=Han}/u.test(w)) {
      const cs = Array.from(w);
      if (cs.length === 1 || doc) out.push(...cs);
      for (let i = 0; i < cs.length - 1; i++) out.push(cs[i] + cs[i + 1]);
    } else {
      const t = w.replace(/^[._-]+|[._-]+$/g, '');
      if (t.length < 2 || STOP.has(t)) continue;
      out.push(t);
      if (t.endsWith('s') && t.length > 3) out.push(t.slice(0, -1));
      for (const p of t.split(/[._-]/)) if (p.length > 1 && p !== t && !STOP.has(p)) out.push(p);
    }
  }
  return out;
}

function splitFrontmatter(text) {
  const m = /^---\n([\s\S]*?)\n---(?:\n|$)/.exec(text);
  if (!m) return { meta: '', body: text };
  const WANT = new Set(['title', 'tags', 'aliases']); const keep = []; let cur = null;
  for (const l of m[1].split('\n')) {
    const k = /^([A-Za-z_][\w-]*):\s*(.*)$/.exec(l);
    if (k) { cur = k[1]; if (WANT.has(cur) && k[2]) keep.push(k[2]); continue; }
    if (WANT.has(cur) && /^\s*-\s+/.test(l)) keep.push(l.replace(/^\s*-\s+/, ''));
  }
  return { meta: keep.join(' '), body: text.slice(m[0].length) };
}

function walk(root, rel = '', out = []) {
  let ents; try { ents = fs.readdirSync(path.join(root, rel), { withFileTypes: true }); } catch { return out; }
  for (const e of ents) {
    if (e.name.startsWith('.')) continue;
    const r = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name)) walk(root, r, out); }
    else if (e.isFile() && e.name.endsWith('.md')) out.push(r);
  }
  return out;
}

// 读文件：O_NOFOLLOW 不跟软链（遍历时已跳过软链，这里防遍历到打开之间被换掉）；UTF-16 按 BOM 解码；
// CRLF/BOM 归一；读不了、被截断的分别计数，结果里如实报告，不冒充"没有命中"。
function readText(file, stats) {
  let fd = null;
  try {
    fd = fs.openSync(file, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0));
    const buf = Buffer.alloc(MAX_BYTES + 1); const n = fs.readSync(fd, buf, 0, MAX_BYTES + 1, 0);
    if (n > MAX_BYTES) stats.truncated++;
    let b = buf.subarray(0, Math.min(n, MAX_BYTES)); let text;
    if (b[0] === 0xff && b[1] === 0xfe) text = b.subarray(2).toString('utf16le');
    else if (b[0] === 0xfe && b[1] === 0xff) { const c = Buffer.from(b.subarray(2)); c.swap16 && c.length % 2 === 0 && c.swap16(); text = c.toString('utf16le'); }
    else text = b.toString('utf8');
    return text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  } catch { stats.unreadable++; return null; }
  finally { if (fd !== null) try { fs.closeSync(fd); } catch { /* ignore */ } }
}

function loadCorpus(root, stats = { files: 0, unreadable: 0, truncated: 0 }) {
  const st = fs.statSync(root);   // 根目录不存在/不可读直接抛错，由调用方报失败
  if (!st.isDirectory()) throw new Error(`${root} 不是目录`);
  fs.readdirSync(root);
  const docs = [];
  for (const rel of walk(root)) {
    stats.files++;
    const text = readText(path.join(root, rel), stats);
    if (text === null) continue;
    const { meta, body } = splitFrontmatter(text);
    const tt = tokens(path.basename(rel, '.md'), { doc: true });
    docs.push({ rel, body, toks: [...tt, ...tt, ...tt, ...tokens(meta, { doc: true }), ...tokens(body, { doc: true })] });
  }
  return docs;
}

function rank(docs, query, { k1 = 1.2, b = 0.75 } = {}) {
  const q = [...new Set(tokens(query))];
  if (!q.length || !docs.length) return [];
  const N = docs.length; const avg = docs.reduce((s, d) => s + d.toks.length, 0) / N || 1;
  const df = new Map();
  const tfs = docs.map(d => { const tf = new Map(); for (const t of d.toks) tf.set(t, (tf.get(t) || 0) + 1); for (const t of tf.keys()) df.set(t, (df.get(t) || 0) + 1); return tf; });
  const scored = [];
  docs.forEach((d, i) => {
    let s = 0; const tf = tfs[i];
    for (const t of q) {
      const f = tf.get(t); if (!f) continue;
      const n = df.get(t); const idf = Math.log(1 + (N - n + 0.5) / (n + 0.5));
      s += idf * f * (k1 + 1) / (f + k1 * (1 - b + b * d.toks.length / avg));
    }
    if (s > 0) scored.push({ doc: d, score: s });
  });
  return scored.sort((x, y) => y.score - x.score);
}

function snippets(body, query, max = 2) {
  const q = new Set(tokens(query));
  return body.split('\n').map(l => l.trim()).filter(Boolean)
    .map(l => ({ l, n: new Set(tokens(l, { doc: true }).filter(t => q.has(t))).size }))
    .filter(x => x.n > 0).sort((a, b) => b.n - a.n).slice(0, max)
    .map(x => x.l.replace(/[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/g, '�'))
    .map(l => { const cs = Array.from(l); return cs.length > 180 ? cs.slice(0, 177).join('') + '…' : l; });
}

function search(roots, query, limit = 8) {
  const hits = []; const stats = { files: 0, unreadable: 0, truncated: 0 };
  for (const { name, root } of roots) {
    const docs = loadCorpus(root, stats);
    for (const h of rank(docs, query)) hits.push({ vault: name, root, path: h.doc.rel, score: +h.score.toFixed(2), lines: snippets(h.doc.body, query) });
  }
  return { searched: roots.map(r => r.name), stats, hits: hits.sort((a, b) => b.score - a.score).slice(0, limit) };
}

module.exports = { tokens, rank, loadCorpus, search, snippets };

if (require.main === module) {
  const args = process.argv.slice(2);
  const take = (n) => { const i = args.indexOf(n); if (i < 0) return null; const v = args[i + 1]; args.splice(i, 2); return v; };
  const flag = (n) => { const i = args.indexOf(n); if (i < 0) return false; args.splice(i, 1); return true; };
  const nArg = take('-n'); const all = flag('--all'); const json = flag('--json');
  const limit = nArg === null ? 8 : Number(nArg);
  if (!Number.isInteger(limit) || limit < 1) { console.error(`-n 要正整数，收到「${nArg}」`); process.exit(2); }
  const query = args.join(' ').trim();
  if (!query || !tokens(query).length) { console.error('用法：brain find <关键词…> [-n 8] [--all] [--json]（关键词中英都写、带专有名词；纯标点或单个字母查不了）'); process.exit(2); }
  let roots;
  if (all) { const R = require('./registry'); roots = R.vaults().map(v => ({ name: v.name || path.basename(v.path), root: v.path })); }
  else { const root = path.resolve(process.env.BRAIN_ROOT || process.cwd()); roots = [{ name: path.basename(root), root }]; }
  let res;
  try { res = search(roots, query, limit); } catch (e) { console.error(`brain find 失败：${e.message}`); process.exit(1); }
  const note = [res.stats.unreadable && `${res.stats.unreadable} 个文件读不了`, res.stats.truncated && `${res.stats.truncated} 个文件超过 400 KB 只搜了开头`].filter(Boolean).join('，');
  if (json) { console.log(JSON.stringify(res, null, 1)); process.exit(0); }
  if (!res.hits.length) { console.log(`brain find：在 ${res.searched.join('、')}（${res.stats.files} 个文件）没有命中「${query}」——换个说法（中英都试、换同义词/专有名词）再搜，别据此断定没有记录${note ? `；注意：${note}` : ''}`); process.exit(0); }
  console.log(`brain find：${res.searched.join('、')} 里「${query}」的前 ${res.hits.length} 条（按相关度，共搜 ${res.stats.files} 个文件）`);
  res.hits.forEach((h, i) => {
    console.log(`${String(i + 1).padStart(2)}. ${all ? `[${h.vault}] ` : ''}${h.path}  (${h.score})`);
    for (const l of h.lines) console.log(`      │ ${l}`);
  });
  if (note) console.log(`注意：${note}`);
}
