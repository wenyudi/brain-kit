'use strict';
// 会话扫描（零 LLM）：列出本机 Claude Code / Codex 的会话，算 cwd、用户轮次、有没有沉淀过。
// 用途：brief 的「未捞会话」哨兵、harvest-sweep.js 夜间自动捞、/harvest 手动捞时拿路径与浓缩稿。
// 「已捞」判定：会话里出现过对记忆区的写（Write/Edit 路径含 _ai/memory、Bash 往 _ai/memory 写、basic-memory write_note/edit_note），
//            或 _system/.harvest-ledger 登记过（手动 /harvest 与夜间 sweep 捞完都登记）。
// 范围：vault.json 的 harvest.include / harvest.exclude（realpath 前缀）。母版默认排除工作区（工作/个人脱钩 2026-08-20）。
// 缓存：_system/.sessions-cache.json 按 path+mtime+size 存解析结果，开场只重解析变过的文件（codex 两周上千个文件）。
// 用法: node sessions.js list | condense <#n|path> | mark <#n|path> [manual|auto|auto-failed] | json
const { ROOT, fs, path, CONTRACT, stamp } = require('./lib');
const os = require('os');

const HOME = os.homedir();
const CLAUDE_DIR = path.join(HOME, '.claude', 'projects');
const CODEX_DIR = path.join(HOME, '.codex', 'sessions');
const LEDGER = path.join(ROOT, '_system', '.harvest-ledger');
const CACHE = path.join(ROOT, '_system', '.sessions-cache.json');

const real = p => { try { return fs.realpathSync(p); } catch { return p; } };
const under = (p, pre) => p === pre || p.startsWith(pre.endsWith('/') ? pre : pre + '/');

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
  if (cfg.include.length && !cfg.include.some(x => under(c, x))) return false;
  return true;
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

function parseClaude(file) {
  const r = { kind: 'claude', file, id: path.basename(file, '.jsonl'), cwd: '', turns: 0, wrote: false, sub: false, first: '', last: '', topic: '' };
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
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
    } else if (o.type === 'assistant' && !r.wrote) {
      for (const x of (o.message && o.message.content) || []) {
        if (x && x.type === 'tool_use' && touchesMemory(x.name, x.input)) { r.wrote = true; break; }
      }
    }
  }
  return r;
}

function parseCodex(file) {
  const r = { kind: 'codex', file, id: '', cwd: '', turns: 0, wrote: false, sub: false, first: '', last: '', topic: '' };
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    if (!line) continue;
    let o; try { o = JSON.parse(line); } catch { continue; }
    const p = o.payload || {};
    if (o.type === 'session_meta') {
      r.cwd = p.cwd || ''; r.id = p.id || path.basename(file, '.jsonl');
      r.sub = !!(p.source && typeof p.source === 'object' && p.source.subagent);
      if (r.sub) return r;
    } else if (o.type === 'event_msg' && p.type === 'user_message') {
      const text = String(p.message || '');
      r.turns++;
      if (!r.first) { r.first = o.timestamp || ''; r.topic = text.trim().replace(/\s+/g, ' ').slice(0, 60); }
      r.last = o.timestamp || r.last;
    } else if (o.type === 'response_item' && (p.type === 'function_call' || p.type === 'custom_tool_call') && !r.wrote) {
      if (touchesMemory(p.name, p.arguments || p.input || '')) r.wrote = true;
    }
  }
  if (!r.id) r.id = path.basename(file, '.jsonl');
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

function mark(file, mode = 'manual') {
  const e = { file: real(file), mode, at: stamp() };
  fs.appendFileSync(LEDGER, JSON.stringify(e) + '\n');
  return e;
}

// 全量记录（带缓存）；scope 过滤在外面做，缓存只存解析结果
function scanAll(cfg) {
  let cache = {}; try { cache = JSON.parse(fs.readFileSync(CACHE, 'utf8')); } catch { /* 首次 */ }
  const next = {}; const recs = [];
  for (const { f, kind, mtime, size } of listFiles(cfg)) {
    const key = f; const hit = cache[key];
    let rec;
    if (hit && hit.mtime === mtime && hit.size === size) rec = hit.rec;
    else { try { rec = kind === 'claude' ? parseClaude(f) : parseCodex(f); } catch { continue; } }
    next[key] = { mtime, size, rec };
    recs.push({ ...rec, mtime });
  }
  try { fs.mkdirSync(path.dirname(CACHE), { recursive: true }); fs.writeFileSync(CACHE, JSON.stringify(next)); } catch { /* 只读环境无所谓 */ }
  return recs;
}

function unharvested(cfg = loadCfg()) {
  const ledger = loadLedger();
  const grace = Date.now() - cfg.graceHours * 3600e3;
  return scanAll(cfg)
    .filter(r => !r.sub && r.turns >= cfg.minTurns && !r.wrote && inScope(r.cwd, cfg) && r.mtime <= grace)
    .map(r => ({ ...r, ledger: ledger.get(real(r.file)) || null }))
    .filter(r => !r.ledger || r.ledger.mode === 'auto-failed')
    .sort((a, b) => a.mtime - b.mtime);
}

// 浓缩稿：只留人话 + 助手正文 + 工具名/入参片段，砍掉工具输出——给 harvest 读，比读原始 jsonl 便宜一个量级
function condense(file, maxChars = CONTRACT.HARVEST.condenseChars) {
  const kind = file.includes(path.sep + '.codex' + path.sep) ? 'codex' : 'claude';
  const parts = [];
  const add = (who, text, cap) => { const t = String(text || '').trim(); if (t) parts.push(`**${who}:** ${t.length > cap ? t.slice(0, cap) + ' …' : t}`); };
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
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
  let text = parts.join('\n\n');
  if (text.length > maxChars) {
    const head = Math.floor(maxChars * 0.55), tail = Math.floor(maxChars * 0.4);
    text = text.slice(0, head) + '\n\n[… middle truncated by condense() …]\n\n' + text.slice(-tail);
  }
  return text;
}

function short(cwd) { return (cwd || '').replace(HOME, '~').replace('/mnt/workspace', '~/Workspace'); }
function resolveArg(a, list) { if (/^#?\d+$/.test(a)) { const r = list[+a.replace('#', '') - 1]; if (!r) throw new Error('no such index'); return r.file; } return a; }

module.exports = { loadCfg, unharvested, condense, mark, short, LEDGER, CACHE };

if (require.main === module) {
  const [cmd, arg, mode] = process.argv.slice(2);
  const cfg = loadCfg();
  if (!cmd || cmd === 'list') {
    const list = unharvested(cfg);
    if (!list.length) return console.log('无未捞会话');
    list.forEach((r, i) => console.log(`#${i + 1}  ${(r.last || '').slice(0, 10)}  ${r.kind.padEnd(6)}  ${String(r.turns).padStart(3)}轮  ${short(r.cwd)}  「${r.topic}」${r.ledger ? '  ⚠ 上次自动捞失败' : ''}\n     ${r.file}`));
  } else if (cmd === 'json') {
    console.log(JSON.stringify(unharvested(cfg), null, 1));
  } else if (cmd === 'condense') {
    process.stdout.write(condense(resolveArg(arg, unharvested(cfg))));
  } else if (cmd === 'mark') {
    console.log(JSON.stringify(mark(resolveArg(arg, unharvested(cfg)), mode || 'manual')));
  } else {
    console.error('用法: node sessions.js list | json | condense <#n|path> | mark <#n|path> [manual|auto|auto-failed]'); process.exit(1);
  }
}
