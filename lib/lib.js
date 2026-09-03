'use strict';
// 共用工具：vault 根 / AI 区根、时间戳、读写 md+frontmatter、遍历。跨平台。
// 2026-08-28 全合一：单仓三区。vault 顶层 = 人读层（pages/digest/inbox），_ai/memory = 记忆（basic-memory 项目 brain），
// _ai/library = 藏书房（raw 原文 + sources 深消化页，basic-memory 项目 library）。
const fs = require('fs');
const path = require('path');
const matter = require('gray-matter');

// vault 根：环境变量优先，否则取 brain-tools 的上级目录（脚本固定在 vault 根下）
// 2026-09-03 brain-kit：脚本不再住在 vault 里。ROOT = BRAIN_ROOT > 注册表按 cwd 定位 > cwd 本身
const ROOT = process.env.BRAIN_ROOT
  ? path.resolve(process.env.BRAIN_ROOT)
  : (() => { try { const R = require('./registry'); const v = R.vaultAt(process.cwd()) || R.vaultFor(process.cwd()); if (v) return v.path; } catch { /* 无注册表 */ } return process.cwd(); })();

// 记忆区根（basic-memory 项目 brain；2026-08-28 起在 vault 内）
const AI_ROOT = process.env.BRAIN_AI_ROOT
  ? path.resolve(process.env.BRAIN_AI_ROOT)
  : path.join(ROOT, '_ai', 'memory');

// 藏书房根（basic-memory 项目 library：raw/ 原文不可变 + sources/ 深消化页）
const LIB_ROOT = process.env.BRAIN_LIB_ROOT
  ? path.resolve(process.env.BRAIN_LIB_ROOT)
  : path.join(ROOT, '_ai', 'library');

const pad = n => String(n).padStart(2, '0');

// 时间戳一律按人所在的时区，不按机器的。
// 起因(2026-08-23)：这台机器系统时区是 PDT，与人差 15 小时，曾造成库里两套时钟。
// 需要跨时区时用 BRAIN_TZ 覆盖。
const TZ = process.env.BRAIN_TZ || 'Asia/Shanghai';
const FMT = new Intl.DateTimeFormat('en-CA', {
  timeZone: TZ,
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit',
  hourCycle: 'h23',   // 不用 hour12:false —— 部分 Node 会把午夜给成 24
});
const zparts = (d) => {
  const o = {};
  for (const p of FMT.formatToParts(d)) if (p.type !== 'literal') o[p.type] = p.value;
  return o;
};
const stamp = (d = new Date()) => {
  const p = zparts(d);
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
};
const idStamp = (d = new Date()) => {
  const p = zparts(d);
  return `${p.year}${p.month}${p.day}T${p.hour}${p.minute}`;
};

// ISO 周号（digest 文件名 <年>-W<周>），按人的时区算
function isoWeek(d = new Date()) {
  const p = zparts(d);
  const t = new Date(Date.UTC(+p.year, +p.month - 1, +p.day));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((t - yearStart) / 86400e3 + 1) / 7);
  return { year: t.getUTCFullYear(), week, name: `${t.getUTCFullYear()}-W${pad(week)}` };
}

// 文件名安全 slug（保留中文，去非法字符）
const slug = (s, max = 24) =>
  (s || '').replace(/[\\/:*?"<>|\r\n]+/g, '').replace(/\s+/g, '-').replace(/^-+|-+$/g, '').slice(0, max) || 'note';

// 递归列某目录树下的 .md。rootDir 绝对路径 + 相对子层
function listMdIn(rootDir, sub = '') {
  const abs = path.join(rootDir, sub);
  if (!fs.existsSync(abs)) return [];
  const out = [];
  for (const name of fs.readdirSync(abs)) {
    if (name === '.gitkeep' || name.startsWith('.')) continue;
    const full = path.join(abs, name);
    const st = fs.statSync(full);
    if (st.isDirectory()) out.push(...listMdIn(rootDir, path.join(sub, name)));
    else if (name.endsWith('.md')) out.push(full);
  }
  return out;
}
const listMd = layer => listMdIn(ROOT, layer);

// 解析失败不抛异常,返回 parseError 字段——一个写坏的 frontmatter 不该带崩 check/lint/brief 整条链(2026-08-27 审计 finding#4)
function readNote(file) {
  const rel = path.relative(ROOT, file).split(path.sep).join('/');
  try {
    const { data, content } = matter(fs.readFileSync(file, 'utf8'));
    return { file, data: data || {}, content, rel };
  } catch (e) {
    return { file, data: {}, content: '', rel, parseError: String((e && e.message) || e).split('\n')[0].slice(0, 120) };
  }
}

function writeNote(file, data, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, matter.stringify(content, data), 'utf8');
  return file;
}

const allOfType = layer => listMd(layer).map(readNote);

// 提取文本里的双链目标（[[X]] / [[X|别名]] / [[X#锚]] → X）
function wikilinks(text) {
  const re = /\[\[([^\]|#]+)(?:[#|][^\]]*)?\]\]/g;
  const out = new Set();
  let m;
  while ((m = re.exec(text)) !== null) out.add(m[1].trim());
  return [...out];
}

// YAML 会把纯日期解析成 Date（如 date: 2026-08-24），统一成可比较的字符串
const isoStr = v => (v == null ? '' : v instanceof Date ? v.toISOString().slice(0, 16) : String(v));

// ---- 人读层契约单源（check.js 写时校验 / lint.js 日检共用；散文版在 _system/schema.md）----
// 旧的六层契约（notes/entities/…）已随池子退役进 AI 仓（2026-08-26）；AI 仓格式由 basic-memory 管，不归这里。
const CONTRACT = {
  LAYER_TYPES: { pages: 'page', digest: 'digest' },
  REQUIRED: { pages: ['type', 'updated'], digest: ['type', 'date'] },
  RETIRED: ['notes', 'entities', 'log', 'tasks', 'questions', 'outputs'],
  DD: /^\d{4}-\d{2}-\d{2}$/,
  WEEK: /^\d{4}-W\d{2}$/,
  // 巨页阈值（2026-09-01 反巨页规矩）：检索区一实体一页（journal 按日豁免），人读层单文件按域拆。
  // lint 日检详单 + brief 每场轻版共用此单源。
  MAX_LINES: { note: 150, human: 800 },
  // 沉淀触发（2026-09-02 立规）：会话扫描/夜间自动捞的阈值。brief 未捞哨兵 + harvest-sweep 共用。
  HARVEST: { minTurns: 6, windowDays: 7, graceHours: 2, nightlyCap: 3, model: 'sonnet', condenseChars: 80000, timeoutMin: 20 },
  // lesson→craft 拆分哨兵：journal 里 [lesson] 累计数减 craft 页数超过这个值就报（可复用经验没单独成页）
  LESSON_CRAFT_GAP: 5,
  // 仓库体积哨兵（藏书房图片本地化后进 git）：.git + _ai/library/assets 超过就提 LFS/外置
  REPO_MB: 500,
  // 藏书房入库（ingest.js）：B 站无字幕的 ASR 兜底模型；音视频落 vault 外 media 目录
  ASR: { model: 'medium' },
};

// ---- Obsidian CLI（2026-09-03）：用户的 Obsidian 常开（为了同步），删/移/开文件走 app 而不是直接动文件系统——
// 同步插件（fast-note-sync）看到的是正规删除事件，不会把 CLI 删掉的文件推回来（08-06/08-26 两次推尸的根因）。
// 没装 CLI 或 app 没开就返回 ok:false，调用方回退到 fs。vault 名 = 库目录名（Obsidian 以此识别）。
function obsidianCli(args, opts = {}) {
  const { spawnSync } = require('child_process');
  const vault = opts.vault || path.basename(ROOT);
  try {
    const r = spawnSync('obsidian', [`vault=${vault}`, ...args], { encoding: 'utf8', timeout: opts.timeout || 15e3 });
    return { ok: r.status === 0, out: (r.stdout || '').trim(), err: (r.stderr || '').trim() };
  } catch (e) { return { ok: false, out: '', err: String(e && e.message || e) }; }
}
let _obsUp;
function obsidianUp() {
  if (_obsUp === undefined) _obsUp = obsidianCli(['vault', 'info=name'], { timeout: 5e3 }).ok;
  return _obsUp;
}
// 删 vault 内文件：Obsidian 开着就走 app（进 .trash，可捞），否则 fs 直删
function vaultDelete(absFile) {
  const rel = path.relative(ROOT, absFile).split(path.sep).join('/');
  if (obsidianUp()) { const r = obsidianCli(['delete', `path=${rel}`]); if (r.ok && !fs.existsSync(absFile)) return 'obsidian'; }
  fs.unlinkSync(absFile); return 'fs';
}

module.exports = {
  ROOT, AI_ROOT, LIB_ROOT, fs, path, matter, obsidianCli, obsidianUp, vaultDelete,
  stamp, idStamp, isoWeek, slug, listMd, listMdIn, readNote, writeNote, allOfType, wikilinks, isoStr,
  CONTRACT,
};
