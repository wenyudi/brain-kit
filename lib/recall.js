'use strict';
// 全局 SessionStart hook（~/.claude/settings.json 注册，所有目录生效；2026-09-03 回忆侧实验）：零 LLM 的记忆注入——
// 拿当前目录名去 basic-memory 共享服务（127.0.0.1:8000/mcp，与 Claude/Codex 共用）搜最相关的记忆，正文真出现目录名的才打印，最多 3 条。
// vault 根目录有自己的 brief，跳过；$HOME 目录名没信息，跳过。任何失败静默（每步 1.5 s 超时），不拖慢开场。
// 项目名按 cwd 前缀定：母版 vault.json.replicas 各实例的 harvest.include 前缀 → 该实例 memoryProject；否则母版 memoryProject。
const fs = require('fs'); const path = require('path'); const os = require('os');
const BM = process.env.BRAIN_BM_URL || 'http://127.0.0.1:8000/mcp';

let cwd = process.cwd();
try { const inp = JSON.parse(fs.readFileSync(0, 'utf8')); if (inp && inp.cwd) cwd = inp.cwd; } catch { /* 手动调试没 stdin */ }
const real = p => { try { return fs.realpathSync(p); } catch { return p; } };
cwd = real(cwd);
if (cwd === real(os.homedir()) || fs.existsSync(path.join(cwd, '_ai', 'memory'))) process.exit(0);

let project = 'brain';
try { const R = require('./registry'); const v = R.vaultFor(cwd); if (v) project = R.vaultConfig(v).memoryProject || project; } catch { /* 无注册表用默认 */ }
const name = path.basename(cwd);
if (!name || name.length < 3) process.exit(0);

(async () => {
  const post = async (body, sid, method = 'POST') => {
    const ac = new AbortController(); const t = setTimeout(() => ac.abort(), 1500);
    try {
      const res = await fetch(BM, { method, signal: ac.signal, headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', ...(sid ? { 'mcp-session-id': sid } : {}) }, body: method === 'POST' ? JSON.stringify(body) : undefined });
      const text = await res.text();
      const data = text.split('\n').filter(l => l.startsWith('data:')).map(l => l.slice(5).trim()).pop();
      return { sid: res.headers.get('mcp-session-id') || sid, json: data ? JSON.parse(data) : null };
    } finally { clearTimeout(t); }
  };
  const init = await post({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'brain-recall', version: '1' } } });
  await post({ jsonrpc: '2.0', method: 'notifications/initialized' }, init.sid);
  const r = await post({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'search_notes', arguments: { query: name, project, page_size: 6 } } }, init.sid);
  try { await post(null, init.sid, 'DELETE'); } catch { /* 服务端会话清理是尽力而为 */ }
  const text = ((((r.json || {}).result || {}).content || [])[0] || {}).text || '';
  const blocks = text.split(/\n(?=### )/).filter(b => b.startsWith('### '));
  const hits = blocks.filter(b => b.toLowerCase().includes(name.toLowerCase())).slice(0, 3).map(b => {
    const title = b.split('\n')[0].replace(/^### /, '').trim();
    const pl = (/- permalink: (\S+)/.exec(b) || [])[1] || '';
    return `${title}${pl ? `  (${pl})` : ''}`;
  });
  if (hits.length) console.log(`🧠 记忆里与「${name}」相关（basic-memory 项目 ${project}，read_note 拿全文）：\n` + hits.map(h => '  · ' + h).join('\n'));
})().catch(() => { /* 静默 */ });
