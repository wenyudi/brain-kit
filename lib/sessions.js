'use strict';
// 会话扫描（零 LLM）：列出本机 Claude Code / Codex 的会话，算 cwd、用户轮次、有没有沉淀过。
// 用途：brief 的「未捞会话」哨兵、harvest-sweep.js 夜间自动捞、/harvest 手动捞时拿路径与浓缩稿。
// 「未捞」判定（2026-09-03 改为按增量）：起点 = max(上次捞到的轮次, 会话自己最后一次写记忆区的轮次)，之后又多了 ≥ minTurns 轮才算未捞。
//            一场会话可以被捞多次，每次只给新增段——Paseo 长会话是常态（7 天窗口里过半跨天），按文件登记一次就永远不看会丢后半段。
//            登记在 _system/.harvest-ledger（手动 /harvest 与夜间 sweep 捞完都登记，带 turns/off；旧格式没这两项 = 整场已捞）。
// 范围：注册表 scopeOf（include 前缀 / 默认库排除其他库的前缀）；vault.json harvest.include/exclude 覆写；默认库不收 /tmp 下的自动化会话。
// 读法：逐行流式读（Buffer 按 \n 切），永不整读——Node 字符串上限 512 MB，Codex 会话有 1.3 GB 的，整读抛错曾被吞成隐形（2026-09-03 实发）。
// 缓存：_system/.sessions-cache.json 按 path+mtime+size 存解析结果与已解析偏移；jsonl 追加式增长，变了只续读新增字节，开场钩子不再每次重读大文件。
// 用法: node sessions.js list | json | condense <#n|path> | mark <#n|path> [manual|auto|auto-failed]
const { ROOT, fs, path, CONTRACT, stamp } = require('./lib');
const os = require('os');

const HOME = os.homedir();
const CLAUDE_DIR = path.join(HOME, '.claude', 'projects');
const CODEX_DIR = path.join(HOME, '.codex', 'sessions');
const LEDGER = path.join(ROOT, '_system', '.harvest-ledger');
const CACHE = path.join(ROOT, '_system', '.sessions-cache.json');
const CACHE_V = 2;

// realpath；路径已不存在时（会话 cwd 是已删的项目、或软链形态 ~/Workspace/…）沿最近存在的祖先解析再拼回，前缀比较两种形态都对得上
const real = p => {
  try { return fs.realpathSync(p); } catch { /* 不存在：往上找 */ }
  const parts = []; let dir = p;
  while (dir && dir !== path.dirname(dir)) {
    parts.unshift(path.basename(dir)); dir = path.dirname(dir);
    try { return path.join(fs.realpathSync(dir), ...parts); } catch { /* 继续往上 */ }
  }
  return p;
};
const under = (p, pre) => p === pre || p.startsWith(pre.endsWith('/') ? pre : pre + '/');
const TMPDIRS = [...new Set(['/tmp', os.tmpdir()].map(real))];

function loadCfg() {
  let v = {};
  try { v = JSON.parse(fs.readFileSync(path.join(ROOT, '_system', 'vault.json'), 'utf8')); } catch { /* 无配置即默认 */ }
  const h = v.harvest || {};
  const H = CONTRACT.HARVEST;
  let scope = { include: h.include || [], exclude: h.exclude || [] };
  if (!scope.include.length && !scope.exclude.length) { try { scope = require('./registry').scopeOf({ path: ROOT }); } catch { /* 无注册表 */ } }
  return {
    enabled: h.enabled !== false,
    minTurns: h.minTurns ?? H.minTurns,
    windowDays: h.windowDays ?? H.windowDays,
    graceHours: h.graceHours ?? H.graceHours,
    nightlyCap: h.nightlyCap ?? H.nightlyCap,
    model: h.model || H.model,
    include: scope.include.map(real),
    exclude: scope.exclude.map(real),
  };
}

function inScope(cwd, cfg) {
  if (!cwd) return false;
  const c = real(cwd);
  if (cfg.exclude.some(x => under(c, x))) return false;
  if (cfg.include.length) return cfg.include.some(x => under(c, x));
  return !TMPDIRS.some(t => under(c, t));   // 默认库：临时目录里跑的多是脚本驱动的批量会话，不算人的经历（要收就显式 include）
}

// 写记忆区的痕迹（宽松启发式；读不算）
const MEM_WRITE_RE = /(>>?|\btee\b|\bcp\b|\bmv\b|\bsed -i\b|\bwrite_note\b|\bedit_note\b)/;
function touchesMemory(name, input) {
  const s = typeof input === 'string' ? input : JSON.stringify(input || {});
  if (/^mcp__basic-memory__(write_note|edit_note|move_note)$/.test(name || '')) return true;
  if (/write_note|edit_note/.test(name || '')) return true;
  if (!s.includes('_ai/memory')) return false;
  if (/^(Write|Edit|MultiEdit|NotebookEdit)$/.test(name || '')) return true;
  return MEM_WRITE_RE.test(s);
}

// 逐行读 jsonl（同步；内存只占一块 4 MB 读缓冲 + 当前行）。从 start 字节起，yield { line, end }，end = 该行连同 \n 结束处的文件偏移。
// 文件末尾没换行的半行不给（写到一半），下次从 end 续读。
function* lines(file, start = 0) {
  const fd = fs.openSync(file, 'r');
  try {
    const CH = 4 * 1024 * 1024; let pos = start; let pending = [];   // pending = 跨块未完的那一行的前段
    for (;;) {
      const buf = Buffer.allocUnsafe(CH);
      const n = fs.readSync(fd, buf, 0, CH, pos);
      if (n === 0) break;
      const view = buf.subarray(0, n); const base = pos; pos += n;
      let s = 0, i;
      while ((i = view.indexOf(10, s)) >= 0) {
        const piece = view.subarray(s, i);
        const lineBuf = pending.length ? Buffer.concat([...pending, piece]) : piece;
        pending = [];
        yield { line: lineBuf.toString('utf8'), end: base + i + 1 };
        s = i + 1;
      }
      if (s < n) pending.push(Buffer.from(view.subarray(s)));   // 拷一份：别让整块 4 MB 挂在一小段尾巴上
    }
  } finally { fs.closeSync(fd); }
}

const newRec = (kind, file) => ({ kind, file, id: path.basename(file, '.jsonl'), cwd: '', turns: 0, wrote: false, wroteTurn: 0, wroteOff: 0, sub: false, first: '', last: '', topic: '', off: 0 });
const noteWrite = (r, end) => { r.wrote = true; r.wroteTurn = r.turns; r.wroteOff = end; };

// 可续读：传入上次的记录就从 rec.off 起接着算（字段全是单调累加的）
function parseClaude(file, rec) {
  const r = rec || newRec('claude', file);
  for (const { line, end } of lines(file, r.off)) {
    r.off = end;
    if (!line) continue;
    let o; try { o = JSON.parse(line); } catch { continue; }
    if (!r.cwd && o.cwd) r.cwd = o.cwd;
    if (o.isSidechain) continue;
    if (o.type === 'user') {
      const c = o.message && o.message.content;
      let text = '';
      if (typeof c === 'string') text = c;
      else if (Array.isArray(c) && !c.some(x => x && x.type === 'tool_result')) text = c.filter(x => x && x.type === 'text').map(x => x.text).join(' ');
      if (!text.trim()) continue;
      if (/^<(command-|local-command|system-reminder)/.test(text.trim())) continue; // 斜杠命令/系统注入不算人话
      r.turns++;
      if (!r.first) { r.first = o.timestamp || ''; r.topic = text.trim().replace(/\s+/g, ' ').slice(0, 60); }
      r.last = o.timestamp || r.last;
    } else if (o.type === 'assistant') {
      for (const x of (o.message && o.message.content) || []) {
        if (x && x.type === 'tool_use' && touchesMemory(x.name, x.input)) { noteWrite(r, end); break; }
      }
    }
  }
  return r;
}

function parseCodex(file, rec) {
  const r = rec || newRec('codex', file);
  for (const { line, end } of lines(file, r.off)) {
    r.off = end;
    if (!line) continue;
    let o; try { o = JSON.parse(line); } catch { continue; }
    const p = o.payload || {};
    if (o.type === 'session_meta') {
      r.cwd = p.cwd || ''; r.id = p.id || r.id;
      r.sub = !!(p.source && typeof p.source === 'object' && p.source.subagent);
      if (r.sub) return r;
    } else if (o.type === 'event_msg' && p.type === 'user_message') {
      const text = String(p.message || '');
      r.turns++;
      if (!r.first) { r.first = o.timestamp || ''; r.topic = text.trim().replace(/\s+/g, ' ').slice(0, 60); }
      r.last = o.timestamp || r.last;
    } else if (o.type === 'response_item' && (p.type === 'function_call' || p.type === 'custom_tool_call')) {
      if (touchesMemory(p.name, p.arguments || p.input || '')) noteWrite(r, end);
    }
  }
  return r;
}

function listFiles(cfg) {
  const since = Date.now() - cfg.windowDays * 86400e3;
  const out = [];
  const push = (f, kind) => { try { const st = fs.statSync(f); if (st.mtimeMs >= since && st.size > 0) out.push({ f, kind, mtime: st.mtimeMs, size: st.size }); } catch { /* 竞争删除 */ } };
  if (fs.existsSync(CLAUDE_DIR)) for (const proj of fs.readdirSync(CLAUDE_DIR)) {
    const d = path.join(CLAUDE_DIR, proj);
    let names = []; try { names = fs.readdirSync(d); } catch { continue; }
    for (const n of names) if (n.endsWith('.jsonl')) push(path.join(d, n), 'claude');
  }
  // codex 按 YYYY/MM/DD 分目录：只进窗口内的日期目录，省掉上千次 stat
  const dayMin = new Date(since - 86400e3).toISOString().slice(0, 10);
  const walk = (d, depth) => { let es = []; try { es = fs.readdirSync(d, { withFileTypes: true }); } catch { return; } for (const e of es) {
    const f = path.join(d, e.name);
    if (e.isDirectory()) { const rel = path.relative(CODEX_DIR, f).split(path.sep); if (rel.length === 3 && rel.join('-') < dayMin) continue; if (rel.length === 1 && rel[0] < dayMin.slice(0, 4)) continue; walk(f, depth + 1); }
    else if (e.name.endsWith('.jsonl')) push(f, 'codex');
  } };
  if (fs.existsSync(CODEX_DIR)) walk(CODEX_DIR, 0);
  return out;
}

function loadLedger() {
  const m = new Map();
  if (!fs.existsSync(LEDGER)) return m;
  for (const line of fs.readFileSync(LEDGER, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    try { const e = JSON.parse(line); m.set(e.file, e); } catch { /* 坏行跳过 */ }
  }
  return m;
}

// 登记：带捞到的轮次与字节偏移（下次只从这里往后算新增）。extra.rec 没给就从缓存拿。
function mark(file, mode = 'manual', extra = {}) {
  const f = real(file);
  let rec = extra.rec;
  if (!rec) { try { const c = JSON.parse(fs.readFileSync(CACHE, 'utf8')); const files = c.files || {}; rec = (files[f] || files[file] || {}).rec; } catch { /* 无缓存 */ } }
  const e = { file: f, mode, at: stamp() };
  if (rec && typeof rec.turns === 'number') { e.turns = rec.turns; e.off = rec.off || 0; }
  fs.appendFileSync(LEDGER, JSON.stringify(e) + '\n');
  return e;
}

// 全量记录（带缓存、增量续读）；scope 过滤在外面做，缓存只存解析结果
function scanAll(cfg) {
  let cache = {}; try { const c = JSON.parse(fs.readFileSync(CACHE, 'utf8')); if (c && c.v === CACHE_V) cache = c.files || {}; } catch { /* 首次或旧版缓存 */ }
  const next = {}; const recs = [];
  for (const { f, kind, mtime, size } of listFiles(cfg)) {
    const hit = cache[f]; let rec;
    if (hit && hit.mtime === mtime && hit.size === size) rec = hit.rec;
    else if (hit && hit.rec && hit.rec.sub) rec = hit.rec;                       // 子代理会话定性后不再续读
    else {
      const base = hit && hit.rec && !hit.rec.err && size >= hit.rec.off ? { ...hit.rec } : null;   // 追加式增长：续读；变短/重写：从头
      try { rec = kind === 'claude' ? parseClaude(f, base) : parseCodex(f, base); }
      catch (e) { rec = { ...newRec(kind, f), err: String(e && e.message || e).slice(0, 80) }; }
    }
    next[f] = { mtime, size, rec };
    recs.push({ ...rec, mtime, size });
  }
  try { fs.mkdirSync(path.dirname(CACHE), { recursive: true }); fs.writeFileSync(CACHE, JSON.stringify({ v: CACHE_V, files: next })); } catch { /* 只读环境无所谓 */ }
  return recs;
}

// 未捞 = 范围内、闲置超 grace、新增轮次 ≥ minTurns。opts.forSweep：夜间不重试上次失败的（手动 /harvest 仍列出）
function unharvested(cfg = loadCfg(), opts = {}) {
  const ledger = loadLedger();
  const grace = Date.now() - cfg.graceHours * 3600e3;
  const out = [];
  for (const r of scanAll(cfg)) {
    if (r.sub || r.err || r.mtime > grace || !inScope(r.cwd, cfg)) continue;
    const led = ledger.get(real(r.file)) || null;
    const failed = !!led && led.mode === 'auto-failed';
    if (failed && opts.forSweep) continue;
    const ledTurns = !led || failed ? 0 : (led.turns ?? r.turns);   // 旧格式登记没记轮次 → 视为整场已捞
    const base = Math.max(ledTurns, r.wroteTurn || 0);
    const fresh = r.turns - base;
    if (fresh < cfg.minTurns) continue;
    const from = Math.max(!led || failed ? 0 : (led.off ?? 0), r.wroteOff || 0);
    out.push({ ...r, ledger: led, fresh, from, cont: from > 0 });
  }
  return out.sort((a, b) => a.mtime - b.mtime);
}

// 浓缩稿里的密钥打码（会话里 cat 过的配置、带签名的 URL 都会原样躺在工具结果里；捞的实例不该拿到）
const SECRETS = [
  [/\b(?:sk|rk|pk)-[A-Za-z0-9_-]{20,}/g, '[redacted]'],
  [/\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}\b/g, '[redacted]'],
  [/\bgithub_pat_[A-Za-z0-9_]{20,}\b/g, '[redacted]'],
  [/\bAKIA[0-9A-Z]{16}\b/g, '[redacted]'],
  [/\bxox[abprs]-[A-Za-z0-9-]{10,}\b/g, '[redacted]'],
  [/\bzlbx_[A-Za-z0-9_-]{16,}\b/g, '[redacted]'],
  [/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g, '[redacted-jwt]'],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, '[redacted-private-key]'],
  [/\b(Bearer|Basic)\s+[A-Za-z0-9._~+\/=-]{16,}/g, '$1 [redacted]'],
  [/([A-Za-z_-]*(?:api[_-]?key|secret|token|passw(?:or)?d|credential)[A-Za-z_-]*)(["']?\s*[:=]\s*["']?)([^\s"',;]{8,})/gi, '$1$2[redacted]'],
];
function redact(text) { let s = text; for (const [re, rep] of SECRETS) s = s.replace(re, rep); return s; }

// 浓缩稿：只留人话 + 助手正文 + 工具名 + 结果开头。opts.from = 从这个字节起（续捞只给新增段）。
// 头 55% + 尾 40% 预算，中间超出的丢；边读边裁，不把整场攒在内存里。
function condense(file, opts = {}) {
  if (typeof opts === 'number') opts = { maxChars: opts };
  const from = opts.from || 0; const maxChars = opts.maxChars || CONTRACT.HARVEST.condenseChars;
  const headCap = Math.floor(maxChars * 0.55), tailCap = Math.floor(maxChars * 0.4);
  const kind = file.includes(path.sep + '.codex' + path.sep) ? 'codex' : 'claude';
  const head = [], tail = []; let headLen = 0, tailLen = 0, dropped = 0;
  const add = (who, text, cap) => {
    let t = String(text || '').trim(); if (!t) return;
    if (t.length > cap * 2) t = t.slice(0, cap * 2);
    t = redact(t);
    const part = `**${who}:** ${t.length > cap ? t.slice(0, cap) + ' …' : t}`;
    if (headLen + part.length <= headCap) { head.push(part); headLen += part.length + 2; return; }
    tail.push(part); tailLen += part.length + 2;
    while (tailLen > tailCap && tail.length > 1) { tailLen -= tail.shift().length + 2; dropped++; }
  };
  for (const { line } of lines(file, from)) {
    if (!line) continue;
    let o; try { o = JSON.parse(line); } catch { continue; }
    if (kind === 'claude') {
      if (o.isSidechain) continue;
      if (o.type === 'user') {
        const c = o.message && o.message.content;
        if (typeof c === 'string') add('User', c, 4000);
        else if (Array.isArray(c)) for (const x of c) {
          if (!x) continue;
          if (x.type === 'text' && !/^<(command-|local-command|system-reminder)/.test(x.text.trim())) add('User', x.text, 4000);
          if (x.type === 'tool_result') { const t = typeof x.content === 'string' ? x.content : JSON.stringify(x.content || ''); add('Result', t, 300); }
        }
      } else if (o.type === 'assistant') {
        for (const x of (o.message && o.message.content) || []) {
          if (!x) continue;
          if (x.type === 'text') add('Assistant', x.text, 3000);
          if (x.type === 'tool_use') add('Tool ' + x.name, JSON.stringify(x.input || {}), 200);
        }
      }
    } else {
      const p = o.payload || {};
      if (o.type === 'event_msg' && p.type === 'user_message') add('User', p.message, 4000);
      else if (o.type === 'event_msg' && p.type === 'agent_message') add('Assistant', p.message, 3000);
      else if (o.type === 'response_item' && (p.type === 'function_call' || p.type === 'custom_tool_call')) add('Tool ' + (p.name || ''), p.arguments || p.input || '', 200);
      else if (o.type === 'response_item' && (p.type === 'function_call_output' || p.type === 'custom_tool_call_output')) add('Result', typeof p.output === 'string' ? p.output : JSON.stringify(p.output || ''), 300);
    }
  }
  const parts = dropped ? [...head, `[… ${dropped} middle entries truncated by condense() …]`, ...tail] : [...head, ...tail];
  const note = from ? '[continuation: the earlier part of this session was already harvested; this transcript starts mid-session]\n\n' : '';
  return note + parts.join('\n\n');
}

function short(cwd) { return (cwd || '').replace(HOME, '~').replace('/mnt/workspace', '~/Workspace'); }
function resolveArg(a, list) {
  if (/^#?\d+$/.test(a)) { const r = list[+a.replace('#', '') - 1]; if (!r) throw new Error('no such index'); return r; }
  return list.find(r => real(r.file) === real(a)) || { file: a, from: 0 };
}

module.exports = { loadCfg, unharvested, condense, mark, short, redact, LEDGER, CACHE, _internal: { lines, parseClaude, parseCodex, scanAll } };

if (require.main === module) {
  const [cmd, arg, mode] = process.argv.slice(2);
  const cfg = loadCfg();
  if (!cmd || cmd === 'list') {
    const list = unharvested(cfg);
    if (!list.length) return console.log('无未捞会话');
    list.forEach((r, i) => console.log(`#${i + 1}  ${(r.last || '').slice(0, 10)}  ${r.kind.padEnd(6)}  ${String(r.turns).padStart(3)}轮${r.cont ? `（续捞：新增 ${r.fresh} 轮）` : ''}  ${short(r.cwd)}  「${r.topic}」${r.ledger && r.ledger.mode === 'auto-failed' ? '  ⚠ 上次自动捞失败' : ''}\n     ${r.file}`));
  } else if (cmd === 'json') {
    console.log(JSON.stringify(unharvested(cfg), null, 1));
  } else if (cmd === 'condense') {
    const r = resolveArg(arg, unharvested(cfg));
    process.stdout.write(condense(r.file, { from: r.from || 0 }));
  } else if (cmd === 'mark') {
    const r = resolveArg(arg, unharvested(cfg));
    console.log(JSON.stringify(mark(r.file, mode || 'manual', typeof r.turns === 'number' ? { rec: r } : {})));
  } else {
    console.error('用法: node sessions.js list | json | condense <#n|path> | mark <#n|path> [manual|auto|auto-failed]'); process.exit(1);
  }
}
