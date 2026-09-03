'use strict';
// 夜间自动沉淀（brain-daily 里跑，在 lint 与快照之前；也可手动）：
// 最近 windowDays 内、轮次够、还没沉淀过的会话，每晚最多 nightlyCap 场，各起一个独立 `claude -p` 实例按 harvest skill 蒸进记忆区。
// 设计：干活的会话不被打断（2026-09-02 拍板，否决 Stop hook 强制版）；捞的实例只干捞，读的是浓缩稿不是原始 jsonl。
// 产物 frontmatter 带 provenance: auto-harvest + session 指针，周报点名让人扫一眼；错了 edit 修。
// 用法: node harvest-sweep.js [--dry-run] [--limit N] [--file <jsonl>]   关：vault.json {"harvest":{"enabled":false}}
const { ROOT, fs, path, CONTRACT, stamp } = require('./lib');
const S = require('./sessions');
const { spawnSync } = require('child_process');
const os = require('os');

const args = process.argv.slice(2);
const dry = args.includes('--dry-run');
const limitArg = args.indexOf('--limit'); const fileArg = args.indexOf('--file');
const cfg = S.loadCfg();
if (!cfg.enabled) { console.log('harvest-sweep: 已在 vault.json 关闭'); process.exit(0); }

const claudeBin = ['claude', path.join(os.homedir(), '.local', 'bin', 'claude'), '/usr/local/bin/claude']
  .find(c => { try { return spawnSync(c, ['--version'], { stdio: 'ignore' }).status === 0; } catch { return false; } });
if (!claudeBin && !dry) { console.log('harvest-sweep: 找不到 claude 可执行文件，跳过'); process.exit(0); }

let list = fileArg >= 0 ? [{ file: args[fileArg + 1], kind: 'manual', turns: '?', cwd: '?', topic: '', last: '' }] : S.unharvested(cfg);
list = list.slice(0, limitArg >= 0 ? +args[limitArg + 1] : cfg.nightlyCap);
if (!list.length) { console.log('harvest-sweep: 无未捞会话'); process.exit(0); }

const memDir = path.join(ROOT, '_ai', 'memory');
const skill = path.join(__dirname, '..', 'skills', 'harvest', 'SKILL.md');
const today = stamp().slice(0, 10);

for (const r of list) {
  const tag = `${(r.last || '').slice(0, 10)} ${r.kind} ${r.turns}轮 ${S.short(r.cwd)} 「${r.topic}」`;
  if (dry) { console.log(`[dry-run] 会捞：${tag}\n   ${r.file}`); continue; }
  const condensed = S.condense(r.file);
  const tmp = path.join(os.tmpdir(), `brain-harvest-${Date.now()}.md`);
  fs.writeFileSync(tmp, condensed);
  const prompt = [
    `Headless nightly harvest run (no human present). Skip the vault's opening self-check entirely; do not touch inbox/, _ai/library/, or the human-readable layer.`,
    `Read ${skill} and follow it to distill ONE past session into the memory zone at ${memDir}/ (write in English; craft/ for reusable lessons, journal/${today}.md for events/decisions with the original session date noted, tasks/ for todos).`,
    `The condensed transcript is at ${tmp} (cwd was ${r.cwd || 'unknown'}, session file ${r.file}, last activity ${r.last || 'unknown'}). Read it with the Read tool; do not open the original jsonl.`,
    `Provenance marking: every craft/, playbooks/ or tasks/ note you create in this run carries frontmatter \`provenance: auto-harvest\` and \`session: ${r.file}\`; journal files keep the normal per-day frontmatter (title/type: journal/created/tags) and instead every bullet you add starts with \`auto-harvest (original session <date>):\`. Before creating a craft/ note, grep ${memDir}/craft for the same topic and update the existing note instead if one exists.`,
    `If nothing in the session is worth keeping under the admission rules, append one line to journal/${today}.md: "- auto-harvest: session ${path.basename(r.file)} (${S.short(r.cwd)}) reviewed, nothing worth keeping." Do not commit; the daily snapshot commits. Finish with one line per file written, prefixed "↳".`,
  ].join('\n\n');
  console.log(`harvest-sweep: 捞 ${tag}`);
  const t0 = Date.now();
  const res = spawnSync(claudeBin, ['-p', prompt, '--dangerously-skip-permissions', '--no-session-persistence', '--output-format', 'text', '--model', cfg.model], {
    cwd: ROOT, encoding: 'utf8', timeout: CONTRACT.HARVEST.timeoutMin * 60e3, maxBuffer: 16 * 1024 * 1024,
    // 去掉嵌套标记：手动在 claude 会话里跑 sweep 时，子进程不该以为自己是嵌套实例
    env: { ...Object.fromEntries(Object.entries(process.env).filter(([k]) => k !== 'CLAUDECODE')), PATH: `${path.join(os.homedir(), '.local', 'bin')}:${process.env.PATH || '/usr/bin:/bin'}` },
  });
  const ok = res.status === 0;
  const secs = Math.round((Date.now() - t0) / 1000);
  console.log((res.stdout || '').trim().split('\n').filter(l => l.startsWith('↳') || /nothing worth/i.test(l)).join('\n') || (res.stdout || '').trim().slice(-600));
  if (!ok) console.log(`   失败 exit=${res.status} ${res.error ? res.error.message : ''} ${(res.stderr || '').trim().slice(-400)}`);
  S.mark(r.file, ok ? 'auto' : 'auto-failed');
  console.log(`   ${ok ? '登记 ledger' : '记为 auto-failed（夜间不再重试；手动 /harvest 仍可捞）'}，用时 ${secs}s`);
  try { fs.unlinkSync(tmp); } catch { /* 无所谓 */ }
}
