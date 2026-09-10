#!/usr/bin/env node
'use strict';
// brain sec —— 用凭据而不读凭据。
// 密码放库外一个守卫文件（默认 ~/Private/secrets，protect-secrets 拦直读），
// 调用时只写名字：值直接进目标命令的环境变量或 stdin，永不经过助手上下文、永不进 argv（ps 看不到）。
//
//   brain sec ls                          列出可用的名字（只名字，不含值）
//   brain sec env NAME[,NAME…] -- cmd …   把这些名字作为环境变量注入 cmd 后执行
//   brain sec stdin NAME -- cmd …         把这个名字的值写进 cmd 的 stdin（喂 sudo -S / ssh 远端 sudo -S）
//   brain sec check                       自检：文件在否、权限 0600 否、能解析几条
//
// 存储格式：每行 NAME=value，value 是等号后到行尾的原文（不去引号、可含空格/$/引号，不能含换行）；# 开头与空行忽略。
// 命名约定：<HOST>_<用途>，如 FNOS_SUDO、OPENWRT_ROOT、ALIYUN_AK、ALIYUN_SK。名字随便起，`brain sec ls` 告诉助手有哪些。
// 换存储位置：设环境变量 BRAIN_SECRETS 指到别的文件即可（仍须在库外、被 protect-secrets 覆盖的路径下）。

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const STORE = process.env.BRAIN_SECRETS || path.join(os.homedir(), 'Private', 'secrets');
const die = (m) => { process.stderr.write(`brain sec: ${m}\n`); process.exit(1); };

function load() {
  let raw;
  try { raw = fs.readFileSync(STORE, 'utf8'); }
  catch { die(`存储不存在或读不了：${STORE}\n  建一个：写每行 NAME=value（值到行尾，原文），chmod 600。`); }
  const map = new Map();
  for (const line of raw.split('\n')) {
    if (!line.trim() || line.trimStart().startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 0) continue;
    const name = line.slice(0, eq).trim();
    if (name) map.set(name, line.slice(eq + 1).replace(/\r$/, ''));
  }
  return map;
}

// 权限体检：库外密钥文件应当 0600，group/other 可读就是漏。警告但不拦（不影响用，只提醒）。
function modeWarn() {
  try {
    const m = fs.statSync(STORE).mode & 0o077;
    if (m) process.stderr.write(`brain sec: ⚠ ${STORE} 权限过宽（group/other 可读），建议 chmod 600\n`);
  } catch { /* ls/check 已处理不存在 */ }
}

function pick(names) {
  const map = load();
  const out = {};
  const missing = [];
  for (const n of names) { if (map.has(n)) out[n] = map.get(n); else missing.push(n); }
  if (missing.length) die(`存储里没有这些名字：${missing.join(', ')}（brain sec ls 看有哪些）`);
  return out;
}

function splitCmd(args) {
  const i = args.indexOf('--');
  if (i < 0) die('缺少 -- 分隔符：brain sec env NAME -- <命令> [参数…]');
  const names = args.slice(0, i).join(',').split(',').map(s => s.trim()).filter(Boolean);
  const cmd = args.slice(i + 1);
  if (!names.length) die('没给名字');
  if (!cmd.length) die('-- 后面没有命令');
  return { names, cmd };
}

const sub = process.argv[2];
const rest = process.argv.slice(3);

if (sub === 'ls') {
  const map = load(); modeWarn();
  const names = [...map.keys()].sort();
  process.stdout.write(names.length ? names.join('\n') + '\n' : '(空)\n');
  process.stderr.write(`# ${names.length} 条，源 ${STORE}\n`);
  process.exit(0);
}

if (sub === 'check') {
  let ok = true;
  if (!fs.existsSync(STORE)) { process.stdout.write(`⚠ 存储不存在：${STORE}\n`); process.exit(1); }
  const m = fs.statSync(STORE).mode & 0o077;
  if (m) { process.stdout.write(`⚠ 权限过宽（${(fs.statSync(STORE).mode & 0o777).toString(8)}），应 600\n`); ok = false; }
  const n = load().size;
  process.stdout.write(`${ok ? '✅' : '⚠ '} ${STORE}：${n} 条${ok ? '，权限 600' : ''}\n`);
  process.exit(ok ? 0 : 1);
}

if (sub === 'env') {
  modeWarn();
  const { names, cmd } = splitCmd(rest);
  const secrets = pick(names);
  const r = spawnSync(cmd[0], cmd.slice(1), { stdio: 'inherit', env: { ...process.env, ...secrets } });
  if (r.error) die(`执行失败：${r.error.message}`);
  process.exit(r.status == null ? 1 : r.status);
}

if (sub === 'stdin') {
  modeWarn();
  const { names, cmd } = splitCmd(rest);
  if (names.length !== 1) die('stdin 模式只接一个名字');
  const val = pick(names)[names[0]];
  const r = spawnSync(cmd[0], cmd.slice(1), { input: val + '\n', stdio: ['pipe', 'inherit', 'inherit'] });
  if (r.error) die(`执行失败：${r.error.message}`);
  process.exit(r.status == null ? 1 : r.status);
}

process.stderr.write(fs.readFileSync(__filename, 'utf8').split('\n').slice(3, 14).map(l => l.replace(/^\/\/ ?/, '')).join('\n') + '\n');
process.exit(sub ? 1 : 0);
