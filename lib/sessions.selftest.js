'use strict';
// sessions.js 回放自测（改 sessions.js 后必跑；npm test 带跑）：合成小 jsonl，不碰真库、不读真会话。
// 断言：全量解析字段正确 · 增量续读 == 全量解析 · 文件尾的半行不吞（off 停在最后一个完整行尾）· 超过读块的长行不截 · 子代理早停 · 打码规则 · 续捞浓缩稿只含新增段
const os = require('os'); const path = require('path'); const fs = require('fs');
process.env.BRAIN_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'brain-sessions-test-'));
const S = require('./sessions'); const { lines, parseClaude, parseCodex } = S._internal;
const T = process.env.BRAIN_ROOT;
const J = o => JSON.stringify(o) + '\n';
let fails = 0; const ok = (cond, msg) => { console.log(`${cond ? '✅' : '❌'} ${msg}`); if (!cond) fails++; };
const same = (a, b) => ['turns', 'wroteTurn', 'wroteOff', 'first', 'last', 'topic', 'cwd', 'off', 'sub'].filter(k => JSON.stringify(a[k]) !== JSON.stringify(b[k]));

// —— claude 形态：8 轮人话（含中文），第 3 轮后助手写记忆区；夹 system-reminder / 侧链 / 纯 tool_result 的 user 行（都不算轮次）
const ts = i => `2026-09-01T00:00:${String(i).padStart(2, '0')}Z`;
const claudeLines = [];
for (let i = 1; i <= 8; i++) {
  claudeLines.push(J({ type: 'user', cwd: '/tmp/proj', timestamp: ts(i), message: { role: 'user', content: i === 1 ? '第一句 hello world' : `turn ${i}` } }));
  if (i === 2) claudeLines.push(J({ type: 'user', timestamp: ts(i), message: { role: 'user', content: '<system-reminder>ignored</system-reminder>' } }));
  if (i === 2) claudeLines.push(J({ type: 'user', isSidechain: true, timestamp: ts(i), message: { role: 'user', content: 'sidechain turn' } }));
  if (i === 4) claudeLines.push(J({ type: 'user', timestamp: ts(i), message: { role: 'user', content: [{ type: 'tool_result', content: 'x' }] } }));
  claudeLines.push(J({ type: 'assistant', timestamp: ts(i), message: { role: 'assistant', content: i === 3
    ? [{ type: 'text', text: 'writing' }, { type: 'tool_use', name: 'Write', input: { file_path: '/v/_ai/memory/journal/2026-09-01.md', content: 'x' } }]
    : [{ type: 'text', text: `reply ${i}` }] } }));
}
const cf = path.join(T, 'c.jsonl'); fs.writeFileSync(cf, claudeLines.join(''));
const full = parseClaude(cf);
ok(full.turns === 8 && full.cwd === '/tmp/proj' && full.first === ts(1) && full.last === ts(8) && full.topic === '第一句 hello world', `claude 全量：turns=${full.turns} cwd=${full.cwd} topic=${full.topic}`);
ok(full.wrote && full.wroteTurn === 3 && full.wroteOff > 0 && full.off === fs.statSync(cf).size, `claude 写记忆区定位在第 ${full.wroteTurn} 轮，off=文件大小`);

// —— 增量续读：先写前半 + 半行，再补齐
const buf = fs.readFileSync(cf); const mid = buf.indexOf(10, Math.floor(buf.length / 2)) + 1;
const inc = path.join(T, 'inc.jsonl'); fs.writeFileSync(inc, buf.subarray(0, mid + 5));
const r1 = parseClaude(inc); ok(r1.off === mid, `半行不吞：off 停在最后完整行尾（${r1.off} == ${mid}）`);
fs.appendFileSync(inc, buf.subarray(mid + 5));
const r2 = parseClaude(inc, { ...r1 }); const diff = same({ ...full, file: '' }, { ...r2, file: '' });
ok(!diff.length, `增量续读 == 全量解析${diff.length ? '（差异：' + diff.join(',') + '）' : ''}`);

// —— 超过 4 MB 读块的长行
const big = 'x'.repeat(5 * 1024 * 1024) + '中文尾巴';
const bf = path.join(T, 'big.jsonl'); fs.writeFileSync(bf, 'a\n' + big + '\nb\n');
const got = [...lines(bf)]; ok(got.length === 3 && got[1].line === big && got[2].end === fs.statSync(bf).size, `长行跨块不截（${got.length} 行，长行 ${got[1] && got[1].line.length} 字符）`);

// —— codex 形态 + 子代理早停
const codexLines = [J({ type: 'session_meta', timestamp: ts(0), payload: { id: 'S1', cwd: '/tmp/work' } })];
for (let i = 1; i <= 5; i++) {
  codexLines.push(J({ type: 'event_msg', timestamp: ts(i), payload: { type: 'user_message', message: `u${i}` } }));
  codexLines.push(J({ type: 'response_item', timestamp: ts(i), payload: i === 2 ? { type: 'function_call', name: 'shell', arguments: 'cat x >> /v/_ai/memory/journal/x.md' } : { type: 'function_call', name: 'shell', arguments: 'ls' } }));
}
const xf = path.join(T, 'x.jsonl'); fs.writeFileSync(xf, codexLines.join(''));
const xr = parseCodex(xf); ok(xr.turns === 5 && xr.cwd === '/tmp/work' && xr.wroteTurn === 2 && xr.id === 'S1', `codex 全量：turns=${xr.turns} wroteTurn=${xr.wroteTurn} id=${xr.id}`);
const sf = path.join(T, 'sub.jsonl'); fs.writeFileSync(sf, J({ type: 'session_meta', payload: { id: 'S2', cwd: '/tmp/work', source: { subagent: { depth: 1 } } } }) + codexLines.slice(1).join(''));
const sr = parseCodex(sf); ok(sr.sub && sr.turns === 0, '子代理会话早停（sub=true, turns=0）');

// —— 打码
const red = S.redact('X-API-Key: zlbx_ABCDEFGHIJKLMNOPQRSTUV sk-abcdefghijklmnopqrstuvwxyz12 ?jwt=eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c password: hunter2hunter2 max_tokens: 4096');
ok(!/zlbx_A|sk-abc|eyJhbGci|hunter2/.test(red) && /max_tokens: 4096/.test(red), `打码：${red}`);

// —— 续捞浓缩稿：从 wroteOff 起只含之后的轮次
const cond = S.condense(cf, { from: full.wroteOff });
ok(cond.startsWith('[continuation') && !cond.includes('turn 2') && cond.includes('turn 8') && cond.includes('turn 4'), '续捞浓缩稿只含新增段并带续捞标注');

fs.rmSync(T, { recursive: true, force: true });
console.log(fails ? `❌ ${fails} 项失败` : '✅ sessions 自测全部通过');
process.exit(fails ? 1 : 0);
