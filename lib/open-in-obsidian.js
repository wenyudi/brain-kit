'use strict';
// 让 Obsidian 直接翻到某页（digest 送达的最后一公里）。用法: node open-in-obsidian.js "digest/2026-W35.md"
// 走 obsidian:// URI：Obsidian 开着就跳转，没开就顺带启动；无桌面环境/没装则静默认输（brief 里有指针，不影响主流程）。
const path = require('path');
const { execFile } = require('child_process');
const { ROOT } = require('./lib');

const rel = process.argv[2];
if (!rel) { console.error('用法: node open-in-obsidian.js <vault 相对路径>'); process.exit(1); }

const vault = path.basename(ROOT);
// 2026-09-03：Obsidian CLI 在就直接开（比 URI 稳），否则回退 URI
try { const { obsidianCli } = require('./lib'); const r = obsidianCli(['open', `path=${rel}`], { vault }); if (r.ok) { console.log(`Obsidian 已打开 ${rel}`); process.exit(0); } } catch { /* 回退 */ }
const uri = `obsidian://open?vault=${encodeURIComponent(vault)}&file=${encodeURIComponent(rel.replace(/\.md$/, ''))}`;
execFile('xdg-open', [uri], { timeout: 5000 }, err => {
  if (err) { console.error('Obsidian 打不开（无桌面环境或未装）——不影响，digest 已落盘'); process.exit(0); }
  console.log(`已请求 Obsidian 打开 ${rel}`);
});
