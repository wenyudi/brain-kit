'use strict';
// 健康体检（零 LLM，每日 06:00）：人读层契约 / 死链 / 常青页保鲜 / inbox 积压 / _ai 区基本盘（记忆+藏书房）。只报告不擅改。
// 契约规则表单源在 lib.js 的 CONTRACT（与 check.js 写时校验共用）。
const { ROOT, AI_ROOT, LIB_ROOT, fs, path, listMdIn, readNote, wikilinks, isoStr, stamp, CONTRACT } = require('./lib');
const { LAYER_TYPES, REQUIRED, DD, WEEK } = CONTRACT;

const pages = listMdIn(ROOT, 'pages').map(readNote);
const digests = listMdIn(ROOT, 'digest').map(readNote);
const inbox = listMdIn(ROOT, 'inbox');
const today = stamp().slice(0, 10);

const P = { contract: [], deadlinks: [], freshness: [], zombie: [], ai: [] };

// 退役件复活哨兵：fast-note-sync 服务端会把已删文件推回来（2026-08-26 实发，08-06 同型）。
// 复活了就报——处理办法见 CLAUDE.md 底线（在 Obsidian 里删或清插件服务端，别只 CLI rm）。
const RETIRED_FILES = [
  'brain-tools/index.js', 'brain-tools/precompile.js', 'brain-tools/backlinks.js', 'brain-tools/search.js',
  'brain-tools/embed.js', 'brain-tools/push.js', 'brain-tools/test.js',
  '_system/bases/任务.base', '_system/bases/实体.base', '_system/bases/问题.base',
  '_system/conventions.md', '_templates/daily.md',
];
const countFiles = (dir) => { let n = 0; for (const e of fs.readdirSync(dir, { withFileTypes: true })) { const f = path.join(dir, e.name); n += e.isDirectory() ? countFiles(f) : 1; } return n; };
CONTRACT.RETIRED.forEach(d => { const abs = path.join(ROOT, d); if (fs.existsSync(abs)) P.zombie.push(`${d}/ 复活（${countFiles(abs)} 个文件）`); });
RETIRED_FILES.forEach(f => { if (fs.existsSync(path.join(ROOT, f))) P.zombie.push(`${f} 复活`); });

// 人读层契约（必填/枚举/格式——写时 check.js 拦过一道，这里兜每日全量）
for (const [layer, arr] of [['pages', pages], ['digest', digests]]) {
  arr.forEach(n => {
    if (n.parseError) { P.contract.push(`${n.rel} frontmatter 解析失败：${n.parseError}`); return; }
    REQUIRED[layer].forEach(f => { if (n.data[f] === undefined) P.contract.push(`${n.rel} 缺字段 ${f}`); });
    if (n.data.type !== undefined && n.data.type !== LAYER_TYPES[layer]) P.contract.push(`${n.rel} type=${n.data.type} 应为 ${LAYER_TYPES[layer]}`);
    for (const f of ['updated', 'date'])
      if (n.data[f] !== undefined && !DD.test(isoStr(n.data[f]).slice(0, 10))) P.contract.push(`${n.rel} ${f} 不是 YYYY-MM-DD`);
  });
}
digests.forEach(n => { if (!WEEK.test(path.basename(n.file, '.md'))) P.contract.push(`${n.rel} 文件名应为 <年>-W<周>`); });

// 死链：人读层内部互链必须可达（指向 AI 仓/外部的不管；带扩展名的嵌入按原样验）
// 人读层目录：实例在 _system/vault.json 的 humanDirs 覆写（如 Work Vault 的「速查」），没有就母版默认（与 brief.js 同源）
let vcfg = {}; try { vcfg = JSON.parse(fs.readFileSync(path.join(ROOT, '_system', 'vault.json'), 'utf8')); } catch { /* 默认 */ }
const HUMAN = vcfg.humanDirs || ['pages', 'digest', 'navigation', '_Private', '_system'];
const existing = new Set();
HUMAN.forEach(l => listMdIn(ROOT, l).forEach(f => existing.add(path.relative(ROOT, f).split(path.sep).join('/').replace(/\.md$/, ''))));
['HOME', 'README', 'CLAUDE', 'DEPLOY', 'TUTORIAL'].forEach(n => existing.add(n));
const scan = [...pages, ...digests, readNote(path.join(ROOT, 'HOME.md')), ...listMdIn(ROOT, 'navigation').map(readNote)];
scan.forEach(n => {
  wikilinks(n.content).forEach(l => {
    if (/^https?:/.test(l)) return;
    if (/\.[A-Za-z0-9]{2,5}$/.test(l)) { // 嵌入（图片/.base 等）：按带扩展名的真实路径验
      if (!fs.existsSync(path.join(ROOT, l))) P.deadlinks.push(`${n.rel}  →  [[${l}]]`);
      return;
    }
    if (!l.includes('/')) return; // 裸链不强制（人读层随手写，Obsidian 自己能解析的就行）
    if (!existing.has(l)) P.deadlinks.push(`${n.rel}  →  [[${l}]]`);
  });
});

// 常青页保鲜（freshness 刀）：>90 天没刷 updated 的页浮出来，确认仍然成立或更新
const FRESH_DAYS = 90;
const cutoff = stamp(new Date(Date.now() - FRESH_DAYS * 86400e3)).slice(0, 10);
pages.forEach(n => {
  const u = isoStr(n.data.updated).slice(0, 10);
  if (u && u < cutoff) P.freshness.push(`${n.rel}  （上次更新 ${u}——事实还成立吗）`);
});

// 巨页哨兵（2026-09-01 反巨页规矩）：检索区一实体一页——craft/playbooks 超限提示按子题拆+Relations 连边
// （journal 按日豁免，任凭长）；人读层单文件超限提示按域拆子页、正文只留现状（清单史书化的教训）
P.oversize = [];
const lineCount = f => fs.readFileSync(f, 'utf8').split('\n').length;
['craft', 'playbooks'].forEach(d => listMdIn(AI_ROOT, d).forEach(f => {
  const n = lineCount(f);
  if (n > CONTRACT.MAX_LINES.note) P.oversize.push(`${path.relative(ROOT, f).split(path.sep).join('/')} ${n} 行（>${CONTRACT.MAX_LINES.note}：按子题拆 + Relations 连边）`);
}));
[...HUMAN.flatMap(l => listMdIn(ROOT, l)), path.join(ROOT, 'HOME.md')].forEach(f => {
  if (!fs.existsSync(f)) return;
  const n = lineCount(f);
  if (n > CONTRACT.MAX_LINES.human) P.oversize.push(`${path.relative(ROOT, f).split(path.sep).join('/')} ${n} 行（>${CONTRACT.MAX_LINES.human}：按域拆子页，正文只留现状）`);
});

// _ai 区基本盘：存在性 / 到期任务 / 藏书房积压 / 未提交滞留 / bm 同步写坏的链（]]] 前科，2026-08-26 实发）
const AI_PARENT = path.join(ROOT, '_ai');
if (!fs.existsSync(AI_ROOT)) {
  P.ai.push(`记忆区 ${AI_ROOT} 不存在`);
} else {
  listMdIn(AI_ROOT, 'tasks').map(readNote).forEach(t => {
    const name = path.basename(t.file, '.md');
    if (t.parseError) return P.ai.push(`tasks/${name} frontmatter 解析失败`);
    if (t.data.status === 'done') return;
    if (!t.data.due) return P.ai.push(`任务缺 due，永远不会浮出：tasks/${name}`);
    if (isoStr(t.data.due).slice(0, 10) <= today) P.ai.push(`到期任务：${name}（due ${isoStr(t.data.due).slice(0, 10)}）`);
  });
  // 藏书房积压 + raw 篡改哨兵（raw 不可变：只增不改，git 里已跟踪的 raw 出现 M 状态 = 有东西在改原文）
  const consumed = new Set(listMdIn(LIB_ROOT, 'sources').map(readNote)
    .map(n => isoStr(n.data.raw)).filter(Boolean).map(r => path.basename(r)));
  listMdIn(LIB_ROOT, 'raw').map(f => path.basename(f)).filter(b => !consumed.has(b))
    .forEach(b => P.ai.push(`藏书房待消化：raw/${b}`));
  for (const f of listMdIn(AI_PARENT)) {
    const txt = fs.readFileSync(f, 'utf8');
    if (/\]\]\]/.test(txt)) P.ai.push(`${path.relative(AI_PARENT, f)} 有写坏的双链 ]]]（bm 同步前科）`);
  }
  try {
    const { execSync } = require('child_process');
    const st = execSync('git status --porcelain -z -- _ai', { cwd: ROOT, encoding: 'utf8' }).split('\0').filter(Boolean);
    if (st.length) P.ai.push(`_ai/ 未提交改动 ${st.length} 处（snap 每轮会兜，长期滞留才异常）`);
    st.filter(e => /^.?M/.test(e) && e.slice(3).startsWith('_ai/library/raw/'))
      .forEach(e => P.ai.push(`⚠️ raw 原文被改动：${e.slice(3)}（raw 不可变，查是谁在写）`));
  } catch { /* 非 git */ }
}

// 沉淀哨兵（2026-09-02）：lesson→craft 拆分缺口 / 藏书房 stub 与缺字幕 / 未捞会话 / 仓库体积
P.sediment = [];
try {
  const lessons = listMdIn(AI_ROOT, 'journal').reduce((n, f) => n + (fs.readFileSync(f, 'utf8').match(/^\s*- \[lesson\]/gm) || []).length, 0);
  const crafts = listMdIn(AI_ROOT, 'craft').length;
  if (lessons - crafts > CONTRACT.LESSON_CRAFT_GAP) P.sediment.push(`journal 累计 ${lessons} 条 [lesson] 对 craft/ ${crafts} 页——拆成独立 craft 页（规矩见记忆 README）`);
  const raws = listMdIn(LIB_ROOT, 'raw').map(readNote);
  raws.filter(n => n.data.transcript === 'missing').forEach(n => P.sediment.push(`raw 缺字幕：${path.basename(n.file)}`));
  raws.filter(n => +n.data.assets_failed > 0).forEach(n => P.sediment.push(`raw 有 ${n.data.assets_failed} 张图片没下下来（外链仍在）：${path.basename(n.file)}`));
  const S = require('./sessions'); const hc = S.loadCfg();
  if (hc.enabled) { const un = S.unharvested(hc); if (un.length) P.sediment.push(`未捞会话 ${un.length} 场（夜间 sweep 每晚 ${hc.nightlyCap} 场；brain sessions list）`); }
} catch (e) { P.sediment.push(`沉淀哨兵异常：${String(e && e.message).slice(0, 80)}`); }
try {
  const { execSync } = require('child_process');
  const mb = d => fs.existsSync(d) ? Math.round(+execSync(`du -sk "${d}" | cut -f1`, { encoding: 'utf8' }) / 1024) : 0;
  const total = mb(path.join(ROOT, '.git'));
  if (total > CONTRACT.REPO_MB) P.oversize.push(`仓库体积 ${total} MB（.git > ${CONTRACT.REPO_MB}）：查是什么大文件进了 git`);
  P.assetsMb = mb(path.join(LIB_ROOT, 'assets'));
} catch { /* du 不可用 */ }

// 报告
const section = (title, arr) => {
  const ok = arr.length === 0;
  console.log(`\n${ok ? '✅' : '⚠️ '} ${title}${ok ? '：无' : ` (${arr.length})`}`);
  if (!ok) arr.slice(0, 50).forEach(x => console.log('   - ' + x));
  if (arr.length > 50) console.log(`   …还有 ${arr.length - 50} 条`);
};
console.log('=== brain 健康体检 ===');
const aiCounts = fs.existsSync(AI_ROOT)
  ? ['craft', 'playbooks', 'journal', 'tasks'].map(d => `${d} ${listMdIn(AI_ROOT, d).length}`).join(' · ')
  : '不可用';
const libCounts = fs.existsSync(LIB_ROOT)
  ? `raw ${listMdIn(LIB_ROOT, 'raw').length} · sources ${listMdIn(LIB_ROOT, 'sources').length}（stub ${listMdIn(LIB_ROOT, 'sources').map(readNote).filter(n => n.data.depth === 'stub').length}）`
  : '不可用';
console.log(`人读层：pages ${pages.length} · digest ${digests.length} · inbox ${inbox.length}　|　记忆：${aiCounts}　|　藏书房：${libCounts} · 图片 ${P.assetsMb || 0} MB（本机，不进 git）`);
section('人读层契约', P.contract);
section('人读层死链', P.deadlinks);
section(`常青页保鲜（>${FRESH_DAYS} 天未更新）`, P.freshness);
section('退役件复活（同步推尸，需在 Obsidian 侧删）', P.zombie);
section('巨页（超限，拆分候选）', P.oversize);
section('_ai 区（记忆+藏书房）', P.ai);
section('沉淀（lesson→craft / 藏书房入库 / 未捞会话）', P.sediment);
if (inbox.length > 20) console.log(`\n⚠️  inbox 积压 ${inbox.length} 条，对话里说"把 inbox 消化一下"清掉`);

const total = Object.values(P).filter(Array.isArray).reduce((s, a) => s + a.length, 0);
console.log(`\n${total === 0 ? '✅ 全部健康' : `⚠️  共 ${total} 处需关注`}`);
process.exit(0);
