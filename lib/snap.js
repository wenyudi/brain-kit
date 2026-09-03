'use strict';
// git 提交内核：snapshot.sh（每日）与 Stop hook（每轮 checkpoint）共用。
// 用法: node snap.js daily|checkpoint
// - 2026-08-28 全合一：单仓提交——_ai/（记忆+藏书房）已并入 vault，一次 add -A 全覆盖。
//   checkpoint = "落盘即提交"的机器化，同步插件吃档事故(2026-08-06)的机械防线，不再靠引擎自觉
// - vault 守卫：非 git / merge/rebase 中 / 非 master → 静默跳过
// - 顶层哨兵：白名单外的陌生顶层路径不 add，记入 _system/.snapshot-strangers 由 brief 播报
//   （.codex-tmp 差点被 add -A 连库带推 GitHub 的教训；工具爱往 vault 根下蛋）
// - daily 额外写心跳戳 _system/.lastrun-daily（brief 超 30h 告警 = 定时器死亡检测）
// - 任何 git 失败（如并行会话的 index.lock 竞争）静默放弃——快照是兜底，不打断主流程
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
// 2026-09-03 起实例零拷贝共用母版脚本：BRAIN_ROOT 指向哪个 vault 就提交哪个
const { ROOT } = require('./lib');

// vault 顶层白名单：人读层的稳定结构。新增合法顶层目录时在这里加一行。
const ALLOW = new Set([
  '.claude', '.gitignore', 'CLAUDE.md', 'DEPLOY.md', 'HOME.md', 'LICENSE', 'README.md', 'TUTORIAL.md',
  '_Private', '_ai', '_attachments', '_system', '_templates', 'brain-tools',
  'digest', 'inbox', 'navigation', 'pages',
]);

const mode = process.argv[2];
if (!['daily', 'checkpoint'].includes(mode)) { console.error('用法: node snap.js daily|checkpoint'); process.exit(1); }
const msg = mode === 'daily' ? 'auto: daily snapshot' : 'auto: checkpoint';

// —— vault ——
try {
  const git = (...args) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' });
  const g = path.resolve(ROOT, git('rev-parse', '--git-dir').trim());
  const busy = fs.existsSync(path.join(g, 'MERGE_HEAD')) || fs.existsSync(path.join(g, 'rebase-merge')) || fs.existsSync(path.join(g, 'rebase-apply'));
  if (!busy && git('symbolic-ref', '--short', 'HEAD').trim() === 'master') {
    // 陌生顶层 = 未跟踪且不在白名单（已跟踪文件的变更照常入库）。-z 免 git 对中文路径转义。
    const strangers = new Set();
    git('status', '--porcelain', '-z').split('\0').forEach(entry => {
      if (!entry.startsWith('?? ')) return;
      const top = entry.slice(3).split('/')[0];
      if (top && !ALLOW.has(top)) strangers.add(top);
    });
    const strangerFile = path.join(ROOT, '_system', '.snapshot-strangers');
    if (strangers.size) fs.writeFileSync(strangerFile, [...strangers].join('\n') + '\n');
    else if (fs.existsSync(strangerFile)) fs.unlinkSync(strangerFile);

    git('add', '-A', '--', '.', ...[...strangers].map(s => `:(exclude)${s}`));
    let staged = false;
    try { git('diff', '--cached', '--quiet'); } catch { staged = true; }
    if (staged) git('commit', '-q', '-m', msg);
  }
  if (mode === 'daily') fs.writeFileSync(path.join(ROOT, '_system', '.lastrun-daily'), new Date().toISOString() + '\n');
} catch { /* 静默 */ }
