'use strict';
// PostToolUse hook：人读层写时契约校验。
// stdin 收 hook JSON，只校验刚写入的 pages/digest md；违规 → stderr + exit 2（引擎立刻自修，不等每日 lint）。
// 规则表单源在 lib.js 的 CONTRACT（与 lint.js 共用）。_ai/ 区（记忆+藏书房）不归这里管——检索友好第一，无人读契约。
const { ROOT, path, fs, readNote, isoStr, CONTRACT } = require('./lib');
const { LAYER_TYPES, REQUIRED, RETIRED, DD, WEEK } = CONTRACT;

let file;
try { file = JSON.parse(fs.readFileSync(0, 'utf8')).tool_input?.file_path; } catch { /* 非 hook 场景可传参调试 */ }
file = file || process.argv[2];
if (!file) process.exit(0);

const abs = path.resolve(file);
const rel = path.relative(ROOT, abs).split(path.sep).join('/');
if (rel.startsWith('..') || !abs.endsWith('.md')) process.exit(0);
const layer = rel.split('/')[0];

// 退役目录守门：旧习惯写回 notes/ 等 → 当场拦，指路 AI 仓
if (RETIRED.includes(layer)) {
  console.error(`⛔ ${layer}/ 已退役（2026-08-26 重构）：证据/流水/任务进 _ai/memory，整篇资料进 _ai/library（格式见各自 README），人读层只收 pages/ 和 digest/`);
  process.exit(2);
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
