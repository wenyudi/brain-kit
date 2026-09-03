'use strict';
// PostToolUse hook：人读层写时契约校验。
// stdin 收 hook JSON，只校验刚写入的 pages/digest md；违规 → stderr + exit 2（引擎立刻自修，不等每日 lint）。
// 规则表单源在 lib.js 的 CONTRACT（与 lint.js 共用）。_ai/ 区（记忆+藏书房）不归这里管——检索友好第一，无人读契约。
const { ROOT, path, fs, readNote, isoStr, CONTRACT, retiredDirs, refDirs, quickrefLines, doneTodos } = require('./lib');
const { LAYER_TYPES, REQUIRED, DD, WEEK } = CONTRACT;
const RETIRED = retiredDirs();

let file;
try { if (!process.stdin.isTTY) file = JSON.parse(fs.readFileSync(0, 'utf8')).tool_input?.file_path; } catch { /* 非 hook 场景可传参调试 */ }
file = file || process.argv[2];
if (!file) process.exit(0);

const abs = path.resolve(file);
const rel = path.relative(ROOT, abs).split(path.sep).join('/');
if (rel.startsWith('..') || !abs.endsWith('.md')) process.exit(0);
const layer = rel.split('/')[0];

// 退役目录守门：旧习惯写回 notes/ 等 → 当场拦，指路 AI 仓
if (RETIRED.includes(layer)) {
  console.error(`⛔ ${layer}/ 已退役（本库 vault.json retired）：证据/流水/任务进 _ai/memory，整篇资料进 _ai/library（格式见各自 README），人读层只收 pages/ 和 digest/`);
  process.exit(2);
}

// raw 不可变（藏书房规约）：已入库（git 跟踪）的 raw 原文谁都不改；新落一篇 raw 不拦；修图链接走 brain ingest --repair-assets（不经 Write/Edit）
if (rel.startsWith('_ai/library/raw/')) {
  let tracked = false; try { require('child_process').execFileSync('git', ['ls-files', '--error-unmatch', '--', rel], { cwd: ROOT, stdio: 'ignore' }); tracked = true; } catch { /* 未跟踪 = 新文件 */ }
  if (tracked) { console.error(`⛔ ${rel} 是已入库的藏书房 raw 原文，落定后不可变——把它改回去；消化产物写 sources/，修图链接用 brain ingest --repair-assets`); process.exit(2); }
}

// 工具书（速查）写时硬拦（2026-09-03 清单拆分立规，阈值在 CONTRACT）：速查区超行 / 已完成待办滞留 / updated 格式
if (refDirs().includes(layer) && fs.existsSync(abs)) {
  const text = fs.readFileSync(abs, 'utf8'); const bad = [];
  const q = quickrefLines(text);
  if (q > CONTRACT.MAX_LINES.quickref) bad.push(`速查区 ${q} 行 > ${CONTRACT.MAX_LINES.quickref}（硬限一屏：只准替换不准长胖，细节写进域页）`);
  const done = doneTodos(text);
  if (done) bad.push(`${done} 条已完成待办（工具书只记现状：事件写 _ai/memory/journal，然后删掉这几行）`);
  const rn = readNote(abs);
  if (rn.parseError) bad.push(`frontmatter 解析失败（${rn.parseError}）`);
  else if (rn.data.updated !== undefined && !DD.test(isoStr(rn.data.updated).slice(0, 10))) bad.push('updated 不是 YYYY-MM-DD 格式');
  if (bad.length) { console.error(`⛔ ${rel} 工具书契约违规（规矩见 CLAUDE.md 速查节，改对为止）：\n${bad.map(e => ' - ' + e).join('\n')}`); process.exit(2); }
  process.exit(0);
}
if (!LAYER_TYPES[layer] || !fs.existsSync(abs)) process.exit(0);

const n = readNote(abs);
if (n.parseError) {
  console.error(`⛔ ${rel} frontmatter 解析失败（${n.parseError}）——YAML 写坏了，修好再落`);
  process.exit(2);
}
const errs = [];
const D = n.data;

REQUIRED[layer].forEach(f => { if (D[f] === undefined) errs.push(`缺字段 ${f}`); });
if (D.type !== undefined && D.type !== LAYER_TYPES[layer]) errs.push(`type=${D.type} 应为 ${LAYER_TYPES[layer]}`);

if (D.updated !== undefined && !DD.test(isoStr(D.updated).slice(0, 10))) errs.push('updated 不是 YYYY-MM-DD 格式');
if (D.date !== undefined && !DD.test(isoStr(D.date).slice(0, 10))) errs.push('date 不是 YYYY-MM-DD 格式');

if (layer === 'digest' && !WEEK.test(path.basename(abs, '.md')))
  errs.push(`digest 文件名应为 <年>-W<周>（如 2026-W35），现在是 ${path.basename(abs, '.md')}`);

if (errs.length) {
  console.error(`⛔ ${rel} 契约违规（契约见 _system/schema.md，改对为止）：\n${errs.map(e => ' - ' + e).join('\n')}`);
  process.exit(2);
}
