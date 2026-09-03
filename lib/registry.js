'use strict';
// 多目录注册表（2026-09-03 brain-kit）：~/.config/brain/vaults.json，每台机器一份——这台机器上有哪些 vault、各自管哪些 cwd、要不要每日跑。
// vault 自身的设置（humanDirs / harvest 旋钮 / memoryProject / assetsBackup）仍在各 vault 的 _system/vault.json（随库走）。
// 条目：{ name, path, include: [cwd 前缀…], daily: true|false, default: true }
//   include 非空 = 只管这些目录下的会话；没有 include 的库 = 默认库，管"别的库都不管"的一切。
const fs = require('fs'); const path = require('path'); const os = require('os');
const REG = process.env.BRAIN_REGISTRY || path.join(os.homedir(), '.config', 'brain', 'vaults.json');
const real = p => { try { return fs.realpathSync(p); } catch { return p; } };
const under = (p, pre) => p === pre || p.startsWith(pre.endsWith('/') ? pre : pre + '/');

// 不存在 → 空表；存在但坏 JSON → 抛错（曾经把坏文件当空表，随后 upsert 整文件覆盖会把其他库全丢；审计 2026-09-03）
function load() {
  if (!fs.existsSync(REG)) return { vaults: [] };
  let r; try { r = JSON.parse(fs.readFileSync(REG, 'utf8')); } catch (e) { throw new Error(`注册表 ${REG} 不是合法 JSON（${e.message}）——修好再跑，brain 不覆盖它`); }
  r.vaults = r.vaults || []; return r;
}
function save(reg) { fs.mkdirSync(path.dirname(REG), { recursive: true }); fs.writeFileSync(REG, JSON.stringify(reg, null, 2) + '\n'); }
function vaults() { return load().vaults.map(v => ({ ...v, path: real(v.path), include: (v.include || []).map(real) })); }
function vaultConfig(v) { try { return JSON.parse(fs.readFileSync(path.join(v.path, '_system', 'vault.json'), 'utf8')); } catch { return {}; } }
function vaultAt(cwd) { const c = real(cwd || process.cwd()); return vaults().find(v => under(c, v.path)) || null; }
function vaultFor(cwd) {
  const vs = vaults(); const c = real(cwd || process.cwd());
  return vs.find(v => v.include.length && v.include.some(p => under(c, p))) || vs.find(v => v.default) || vs.find(v => !v.include.length) || null;
}
function scopeOf(v) {
  const vs = vaults(); const me = vs.find(x => x.path === real(v.path)) || { ...v, include: (v.include || []).map(real) };
  const include = me.include || [];
  const exclude = include.length ? [] : vs.filter(x => x.path !== me.path).flatMap(x => x.include || []);
  return { include, exclude };
}
// 当前脚本服务哪个 vault：BRAIN_ROOT > cwd 在某个库里 > cwd 属于哪个库的范围
function current() {
  const r = process.env.BRAIN_ROOT ? real(process.env.BRAIN_ROOT) : null;
  const vs = vaults();
  return (r && (vs.find(v => v.path === r) || { name: path.basename(r), path: r, include: [] })) || vaultAt(process.cwd()) || vaultFor(process.cwd());
}
function upsert(entry) {
  const reg = load(); const p = real(entry.path);
  const i = reg.vaults.findIndex(v => real(v.path) === p);
  const merged = { ...(i >= 0 ? reg.vaults[i] : {}), ...entry, path: p };
  if (i >= 0) reg.vaults[i] = merged; else reg.vaults.push(merged);
  save(reg); return merged;
}
module.exports = { REG, load, save, vaults, vaultConfig, vaultAt, vaultFor, scopeOf, current, upsert, real, under };
