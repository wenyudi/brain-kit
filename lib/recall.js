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
  const hits = await require('./bm-client').search(name, project, { timeout: 1500, limit: 6 });
  const selected = hits.filter(h => JSON.stringify([h.title, h.content, h.matched_chunk]).toLowerCase().includes(name.toLowerCase())).slice(0, 3);
  if (!selected.length) return;
  const R = require('./registry'), vault = R.vaultFor(cwd);
  if (!vault) return;
  const context = require('./memory-state').context(vault.path, selected, { maxChars: 4500 });
  console.log(`🧠 与「${name}」相关的记忆（项目 ${project}；先看有效时间、替换关系，未复核内容不能直接当现状）：\n` + JSON.stringify(context));
})().catch(() => { /* Hook remains best-effort; interactive brain memory recall reports failures. */ });
