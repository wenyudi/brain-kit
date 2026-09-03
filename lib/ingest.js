'use strict';
// inbox 机械搬运（零 LLM；brain-daily 每日 06:00 跑，会话里也可随手跑）——2026-09-02 立规，inbox 出口不再等人到场。
// 只搬 source: web 的剪藏（Web Clipper / Bilibili Obsidian Clipper）：
//   1. 说明 = frontmatter `note` 或正文「## 我」段；划线 = 「## 划线」段或 ==高亮==。说明和划线进 raw frontmatter，正文保持原文。
//   2. 外链图片全部下到 _ai/library/assets/<raw 名>/，链接改相对路径，原 URL 留在图片 title 里；失败保留外链并计数。
//   3. B 站无字幕 → yt-dlp 抽音频到 vault 外 media 目录 + faster-whisper（CPU）转写回字幕段，首行标 ASR 来源。
//      --no-asr 时这类文件留在 inbox 等夜里（raw 落定后不可变，所以不能先落再补字幕）。
//   4. 落 raw（不可变）；无说明 → 机械生成 stub source 页（depth: stub）；有说明 → 不写 source 页，留给 LLM 深消化（brief 报积压）。
//   5. 按 url 查重（同步插件推尸/重复剪藏）；重复且带说明的留 inbox 待人工，其余直接删。删原毛坯；有变动就 git 提交。
// source: obsidian 的手记不动（会话里 LLM 分流）。用法: node ingest.js [--dry-run] [--no-asr] [--no-commit] | --repair-assets（连 assets_dead 的也再试）
// 无参跑完顺手重试 assets_failed 的 raw；自动重试 CONTRACT.ASSETS_MAX_ATTEMPTS 次仍失败标 assets_dead（lint 不再天天报）
const { ROOT, LIB_ROOT, fs, path, matter, readNote, listMdIn, slug, stamp, CONTRACT, vaultDelete, obsidianUp } = require('./lib');
const { spawnSync, execFileSync } = require('child_process');
const os = require('os');

const args = process.argv.slice(2);
const dry = args.includes('--dry-run');
const noAsr = args.includes('--no-asr');
const noCommit = args.includes('--no-commit');

const RAW = path.join(LIB_ROOT, 'raw');
const SRC = path.join(LIB_ROOT, 'sources');
const ASSETS = path.join(LIB_ROOT, 'assets');
const MEDIA = process.env.BRAIN_MEDIA_ROOT || path.join(path.dirname(ROOT), 'library-media');
const ASR_PY = process.env.BRAIN_ASR_PY || path.join(os.homedir(), '.local', 'share', 'brain-asr', '.venv', 'bin', 'python');
const ASR_MODEL = process.env.BRAIN_ASR_MODEL || CONTRACT.ASR.model;
const today = stamp().slice(0, 10);
const log = (...a) => console.log(...a);

// ---------- 小工具 ----------
const CJK = /[぀-ヿ㐀-鿿]/g;
const guessLang = t => ((t.match(CJK) || []).length / Math.max(1, t.replace(/\s/g, '').length) > 0.2 ? 'zh' : 'en');
const normUrl = u => { try { const x = new URL(u); x.hash = ''; if (/bilibili\.com$/.test(x.hostname)) x.search = ''; return (x.origin + x.pathname).replace(/\/$/, '').toLowerCase() + x.search; } catch { return String(u || '').trim(); } };
const uniqueFile = (dir, base, ext) => { let f = path.join(dir, base + ext), i = 2; while (fs.existsSync(f)) f = path.join(dir, `${base}-${i++}${ext}`); return f; };

// 顶层 H2 分段：{ pre, secs: [{title, body}] }
function splitH2(content) {
  const lines = content.split('\n'); const secs = []; let pre = []; let cur = null;
  for (const l of lines) {
    const m = /^## +(.+?)\s*$/.exec(l);
    if (m) { cur = { title: m[1].trim(), body: [] }; secs.push(cur); }
    else (cur ? cur.body : pre).push(l);
  }
  secs.forEach(s => { s.body = s.body.join('\n').trim(); });
  return { pre: pre.join('\n').trim(), secs };
}
const joinH2 = (pre, secs) => [pre, ...secs.map(s => `## ${s.title}\n\n${s.body}`)].filter(Boolean).join('\n\n') + '\n';

// ---------- 图片本地化 ----------
const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'image/svg+xml': 'svg', 'image/avif': 'avif', 'image/bmp': 'bmp' };
// 用 curl 下载：Node fetch 在 Cloudflare 盾站拿 403（TLS 指纹被判为机器人），同样的请求 curl 是 200（2026-09-03 实测 idcflare）
async function fetchImage(url, referer, dest) {
  const tmp = dest + '.part';
  const r = spawnSync('curl', ['-sL', '--max-time', '25', '--max-filesize', String(25 * 1024 * 1024), '-A', 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36',
    '-e', referer, '-H', 'Accept: image/avif,image/webp,image/*,*/*;q=0.8', '-o', tmp, '-w', '%{http_code} %{content_type}', url], { encoding: 'utf8' });
  try {
    const [code, ct = ''] = (r.stdout || '').trim().split(' ');
    if (r.status !== 0 || code !== '200') return { ok: false, why: r.status !== 0 ? `curl exit ${r.status}` : `HTTP ${code}` };
    const size = fs.existsSync(tmp) ? fs.statSync(tmp).size : 0;
    if (size < 64) return { ok: false, why: 'empty' };
    let ext = EXT[ct.split(';')[0].trim()]; if (!ext) { const m = /\.(jpe?g|png|webp|gif|svg|avif|bmp)(?:$|[?#])/i.exec(url); ext = m ? m[1].toLowerCase().replace('jpeg', 'jpg') : 'bin'; }
    const file = dest + '.' + ext; fs.renameSync(tmp, file);
    return { ok: true, file };
  } finally { try { fs.unlinkSync(tmp); } catch { /* 已改名 */ } }
}

async function localizeImages(body, pageUrl, rawBase) {
  const found = new Map(); // url -> index
  const add = u => { if (/^https?:\/\//i.test(u) && !found.has(u) && found.size < 300) found.set(u, found.size + 1); };
  for (const m of body.matchAll(/!\[[^\]]*\]\((\S+?)(?:\s+"[^"]*")?\)/g)) add(m[1]);
  for (const m of body.matchAll(/<img\b[^>]*\bsrc="([^"]+)"/g)) add(m[1]);
  if (!found.size) return { body, ok: 0, failed: 0 };
  const dir = path.join(ASSETS, rawBase);
  if (!dry) fs.mkdirSync(dir, { recursive: true });
  const map = new Map(); let ok = 0, failed = 0;
  const entries = [...found.entries()];
  for (let i = 0; i < entries.length; i += 4) {
    await Promise.all(entries.slice(i, i + 4).map(async ([u, n]) => {
      if (dry) { map.set(u, `../assets/${rawBase}/${String(n).padStart(2, '0')}.ext`); ok++; return; }
      const r = await fetchImage(u, pageUrl, path.join(dir, String(n).padStart(2, '0')));
      if (r.ok) { ok++; map.set(u, `../assets/${rawBase}/${path.basename(r.file)}`); } else { failed++; log(`   ✗ 图片 ${r.why}: ${u.slice(0, 90)}`); }
    }));
  }
  let out = body.replace(/!\[([^\]]*)\]\((\S+?)(?:\s+"([^"]*)")?\)/g, (all, alt, u) => map.has(u) ? `![${alt}](${map.get(u)} "${u}")` : all);
  out = out.replace(/<img\b([^>]*)\bsrc="([^"]+)"/g, (all, pre, u) => map.has(u) ? `<img${pre}src="${map.get(u)}" data-src="${u}"` : all);
  if (!dry && failed === found.size) { try { fs.rmdirSync(dir); } catch { /* 非空就留 */ } }
  return { body: out, ok, failed };
}

// ---------- B 站无字幕 → ASR ----------
const asrReady = () => !noAsr && fs.existsSync(ASR_PY) && spawnSync('yt-dlp', ['--version'], { stdio: 'ignore' }).status === 0;
function transcribe(url, rawBase) {
  const dir = path.join(MEDIA, rawBase); fs.mkdirSync(dir, { recursive: true });
  const audio = path.join(dir, 'audio.m4a');
  if (!fs.existsSync(audio)) {
    const dl = spawnSync('yt-dlp', ['-f', 'bestaudio/best', '-x', '--audio-format', 'm4a', '--no-playlist', '-o', path.join(dir, 'audio.%(ext)s'), url], { encoding: 'utf8', timeout: 20 * 60e3 });
    if (dl.status !== 0 || !fs.existsSync(audio)) return { ok: false, why: 'yt-dlp: ' + ((dl.stderr || '').trim().split('\n').pop() || '').slice(0, 120) };
  }
  const py = `import sys\nfrom faster_whisper import WhisperModel\nm=WhisperModel(sys.argv[2],device='cpu',compute_type='int8')\nsegs,info=m.transcribe(sys.argv[1],vad_filter=True,beam_size=1)\nprint('LANG',info.language,file=sys.stderr)\nfor s in segs:\n    t=s.text.strip()\n    if t: print(t)\n`;
  const r = spawnSync(ASR_PY, ['-c', py, audio, ASR_MODEL], { encoding: 'utf8', timeout: 120 * 60e3, maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0 || !(r.stdout || '').trim()) return { ok: false, why: 'whisper: ' + ((r.stderr || '').trim().split('\n').pop() || '').slice(0, 120) };
  const lang = (/LANG (\w+)/.exec(r.stderr || '') || [])[1] || '?';
  return { ok: true, text: r.stdout.trim(), audio, lang };
}

// ---------- 主流程 ----------
async function ingestOne(file, existingUrls) {
  const n = readNote(file); const D = n.data;
  const rel = path.relative(ROOT, file);
  if (n.parseError) { log(`⚠ ${rel}: frontmatter 解析失败，跳过`); return null; }
  if (D.source !== 'web') { return { skipped: 'note' }; }
  const url = String(D.url || '').trim();
  if (!url) { log(`⚠ ${rel}: source: web 但没有 url，留 inbox`); return null; }

  const { pre, secs } = splitH2(n.content);
  const pick = names => secs.find(s => names.includes(s.title.toLowerCase()));
  const meSec = pick(['我', '我的话', 'note', 'my note']);
  const hlSec = pick(['划线', '高亮', 'highlights', 'highlight']);
  const bodySec = pick(['正文', 'content']);
  // B 站插件的自定义属性不能留空值：`-`/`无`/`none` 这类占位当没写（2026-09-03）
  const PLACEHOLDER = /^(-+|无|空|none|n\/a|null|todo|待填|留空)$/i;
  const noteProp = String(D.note || '').trim();
  const note = [PLACEHOLDER.test(noteProp) ? '' : noteProp, meSec ? meSec.body : ''].filter(Boolean).join('\n\n');
  const hlFromSec = hlSec ? hlSec.body.split(/\n(?=\s*- )|\n\s*\n/).map(s => s.replace(/^\s*- /, '').trim()).filter(Boolean) : [];
  let body = bodySec ? bodySec.body : joinH2(pre, secs.filter(s => s !== meSec && s !== hlSec)).trim();
  const hlMarks = [...body.matchAll(/==([^=\n]{3,}?)==/g)].map(m => m[1].trim());
  const highlights = [...new Set([...hlFromSec, ...hlMarks])];

  // 查重
  const key = normUrl(url);
  if (existingUrls.has(key)) {
    if (note) { log(`↔ 重复但带说明，留 inbox 待人工：${rel}`); return null; }
    log(`↔ 重复（raw 已有 ${existingUrls.get(key)}），删毛坯：${rel}`);
    if (!dry) vaultDelete(file);
    return { dup: true };
  }

  // 标题：frontmatter title → 文件名（Web Clipper 的 {{title|safe_name}}，去掉时间前缀）→ 正文首个 H1（README 里的示例标题会误导，放最后）
  const fromName = path.basename(file, '.md').replace(/^\d{8}T\d{4}-/, '').replace(/^\d{4}-\d{2}-\d{2}-/, '').trim();
  const title = String(D.title || fromName || (/^# +(.+)$/m.exec(n.content) || [])[1] || 'untitled').trim();
  const collected = (/^\d{4}-\d{2}-\d{2}/.exec(String(D.created || '')) || [today])[0];
  const isBili = /bilibili\.com/i.test(url) || D.site === 'bilibili';
  const rawBase = `${collected}-${slug(title, 48)}`;
  const rawFile = uniqueFile(RAW, rawBase, '.md');
  const rawName = path.basename(rawFile, '.md');

  // B 站字幕
  let transcript = null; let asrNote = '';
  if (isBili) {
    const idx = secs.findIndex(s => /^(字幕|subtitles?)$/i.test(s.title));
    const has = idx >= 0 && secs[idx].body.replace(/\s/g, '').length >= 20;
    if (has) transcript = 'uploader';
    else if (!asrReady()) { log(`⏳ 无字幕 B 站视频，等夜里 ASR（--no-asr 或工具缺）：${rel}`); return null; }
    else {
      log(`🎧 无字幕，ASR 转写中（${ASR_MODEL}，CPU）：${title.slice(0, 40)}`);
      if (dry) { transcript = `asr:${ASR_MODEL}`; }
      else {
        const r = transcribe(url, rawName);
        if (!r.ok) { log(`   ✗ ASR 失败，留 inbox：${r.why}`); return null; }
        transcript = `asr:${ASR_MODEL}`; asrNote = r.audio;
        const head = `> ASR: faster-whisper ${ASR_MODEL} (int8, CPU) on ${today}; detected language ${r.lang}; uploader subtitles absent at clip time; audio kept at ${r.audio}`;
        const sec = { title: '字幕', body: head + '\n\n' + r.text };
        if (idx >= 0) secs[idx] = sec; else secs.push(sec);
        body = bodySec ? bodySec.body : joinH2(pre, secs.filter(s => s !== meSec && s !== hlSec)).trim();
      }
    }
  }

  // 图片本地化
  const img = await localizeImages(body, url, rawName);
  body = img.body;

  // raw frontmatter：契约字段 + 说明/划线 + 可回溯字段透传
  const fm = { title, type: 'raw', collected, url, lang: guessLang(body), source: 'web', site: D.site || (() => { try { return new URL(url).hostname; } catch { return ''; } })() };
  if (note) fm.note = note;
  if (highlights.length) fm.highlights = highlights;
  for (const k of ['description', 'author', 'published', 'tags', 'bvid', 'cid', 'upload_date', 'subtitle_lang']) {
    const v = D[k]; if (v == null || v === '' || (Array.isArray(v) && !v.length)) continue; fm[k] = v instanceof Date ? v.toISOString().slice(0, 10) : v;
  }
  if (D.created) fm.clipped = String(D.created);
  if (img.ok) fm.assets = img.ok;
  if (img.failed) fm.assets_failed = img.failed;
  if (transcript) fm.transcript = transcript;
  if (asrNote) fm.media = asrNote;
  fm.ingested = stamp(); fm.ingest = 'ingest.js';

  // stub source 页（无说明才写）
  let stubFile = null; let stubWrite = null;
  if (!note) {
    const desc = String(D.description || '').trim() || body.replace(/<[^>]+>/g, '').replace(/!\[[^\]]*\]\([^)]*\)/g, '').replace(/\s+/g, ' ').trim().slice(0, 300);
    stubFile = uniqueFile(SRC, slug(title, 48), '.md');
    const sfm = { title, type: 'source', depth: 'stub', raw: path.basename(rawFile), url, created: today, tags: ['stub', ...(fm.site ? [String(fm.site).toLowerCase()] : [])] };
    const meta = [fm.site && `site: ${fm.site}`, fm.author && `author: ${Array.isArray(fm.author) ? fm.author.join(', ') : fm.author}`, fm.published && `published: ${fm.published}`, fm.upload_date && `uploaded: ${fm.upload_date}`, transcript && `transcript: ${transcript}`, img.ok && `images localized: ${img.ok}${img.failed ? ` (failed ${img.failed})` : ''}`].filter(Boolean).join(' · ');
    const sbody = `# ${title}\n\nStub page generated mechanically by ingest.js on ${today}: the collector left no note at clip time, so this item is a pure archive. To deepen it, say 「消化 ${title}」 and this page becomes a full source page (depth: deep).\n\n**What it is:** ${desc || '(no description captured)'}\n\n**Why collected:** none recorded.\n\n**Provenance:** ${meta || url}\n\n## Relations\n\n- digests [[${title}]]\n`;
    if (!dry) stubWrite = () => { fs.mkdirSync(SRC, { recursive: true }); fs.writeFileSync(stubFile, matter.stringify(sbody, sfm)); };
  }

  if (!dry) {
    fs.mkdirSync(RAW, { recursive: true });
    fs.writeFileSync(rawFile, matter.stringify(body + '\n', fm));
    if (stubWrite) stubWrite();   // raw 先落、stub 后写：raw 写失败不留悬空 stub
    vaultDelete(file);  // Obsidian 开着就经 app 删（同步插件认账，不推尸）
  }
  existingUrls.set(key, path.basename(rawFile));
  log(`✓ ${title.slice(0, 48)}\n   raw/${path.basename(rawFile)}${img.ok ? ` · 图 ${img.ok}${img.failed ? `/失败 ${img.failed}` : ''}` : ''}${transcript ? ` · 字幕 ${transcript}` : ''}${note ? ' · 有说明 → 待深消化' : ` · stub sources/${path.basename(stubFile)}`}`);
  return { raw: 1, stub: stubFile ? 1 : 0, asr: transcript && transcript.startsWith('asr') ? 1 : 0, note: note ? 1 : 0 };
}

// 图片重试：auto=夜间 ingest 顺手跑（只试 assets_failed，CONTRACT.ASSETS_MAX_ATTEMPTS 次仍失败就标 assets_dead——签名 URL 过期/图床下线）；
// 手动 --repair-assets 连 assets_dead 的也再试。只改链接与记账字段，正文不动（raw 不可变的唯一放行）。
async function repairAssets({ auto = false } = {}) {
  let touched = 0, dead = 0;
  for (const f of listMdIn(LIB_ROOT, 'raw')) {
    const n = readNote(f); const D = n.data;
    const wasDead = !(+D.assets_failed > 0) && +D.assets_dead > 0;
    if (!(+D.assets_failed > 0) && !(wasDead && !auto)) continue;
    const base = path.basename(f, '.md');
    const attempts = (+D.assets_attempts || 0) + 1;
    log(`🔧 重试图片：${base}（上次失败 ${D.assets_failed || D.assets_dead}，第 ${attempts} 次）`);
    const img = await localizeImages(n.content, D.url, base);
    const fm = { ...D, assets_attempts: attempts };
    delete fm.assets_failed; delete fm.assets_dead;
    if (img.ok) { fm.assets = (+D.assets || 0) + img.ok; fm.assets_repaired = today; }
    if (img.failed) {
      if (wasDead || (auto && attempts >= CONTRACT.ASSETS_MAX_ATTEMPTS)) { fm.assets_dead = img.failed; dead++; log(`   ${img.failed} 张确认失效（${attempts} 次），不再自动重试`); }
      else { fm.assets_failed = img.failed; log(`   ${img.ok ? `补回 ${img.ok}，` : ''}仍失败 ${img.failed}`); }
    } else log(`   补回 ${img.ok}，全部到位`);
    if (!dry) fs.writeFileSync(f, matter.stringify(img.ok ? img.body : n.content, fm));
    touched++;
  }
  if (touched && !dry && !noCommit) { try { execFileSync('git', ['add', '-A', '--', '_ai/library'], { cwd: ROOT, stdio: 'ignore' }); execFileSync('git', ['commit', '-q', '-m', `ingest: retry assets on ${touched} raw (links → local copies, text unchanged${dead ? `; ${dead} marked dead` : ''})`], { cwd: ROOT, stdio: 'ignore' }); } catch { /* 快照兜 */ } }
  if (touched || !auto) log(`${dry ? '[dry-run] ' : ''}图片重试 ${touched} 篇${dead ? `（${dead} 篇判定失效）` : ''}`);
}

(async () => {
  if (args.includes('--repair-assets')) return repairAssets({ auto: false });
  const files = listMdIn(ROOT, 'inbox');
  if (!files.length) { log('inbox 空'); await repairAssets({ auto: true }); return; }
  log(obsidianUp() ? 'Obsidian 在线：毛坯经 app 删除' : 'Obsidian 不在线：毛坯直接 fs 删除（同步插件可能推尸，brief/lint 有哨兵）');
  const existingUrls = new Map();
  for (const f of listMdIn(LIB_ROOT, 'raw')) { const u = readNote(f).data.url; if (u) existingUrls.set(normUrl(u), path.basename(f)); }
  const sum = { raw: 0, stub: 0, asr: 0, note: 0, dup: 0, notes: 0, left: 0 };
  for (const f of files) {
    const r = await ingestOne(f, existingUrls);
    if (!r) sum.left++;
    else if (r.skipped) sum.notes++;
    else if (r.dup) sum.dup++;
    else { sum.raw += r.raw; sum.stub += r.stub; sum.asr += r.asr; sum.note += r.note; }
  }
  log(`${dry ? '[dry-run] ' : ''}入库 ${sum.raw}（stub ${sum.stub} · 带说明待深消化 ${sum.note} · ASR ${sum.asr}）· 重复删 ${sum.dup} · 手记留分流 ${sum.notes} · 留 inbox ${sum.left}`);
  if (!dry && !noCommit && (sum.raw || sum.dup)) {
    try {
      execFileSync('git', ['add', '-A', '--', '_ai/library', 'inbox'], { cwd: ROOT, stdio: 'ignore' });
      execFileSync('git', ['commit', '-q', '-m', `ingest: ${sum.raw} clips → library (stub ${sum.stub}, noted ${sum.note}, asr ${sum.asr}${sum.dup ? `, dup ${sum.dup}` : ''})`], { cwd: ROOT, stdio: 'ignore' });
      log('git 已提交');
    } catch { log('git 提交失败（可能无变化或 index.lock 竞争），快照会兜'); }
  }
  await repairAssets({ auto: true });
})().catch(e => { console.error('ingest 崩溃：', e); process.exit(1); });
