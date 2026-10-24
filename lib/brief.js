'use strict';
// SessionStart hook：状态简报注入。开场自检不靠 LLM 自觉——到期任务/digest 排期/inbox/藏书房积压/运转健康，机器推送进上下文。
// 2026-08-28 全合一：任务/流水在 _ai/memory，藏书房在 _ai/library，都在 vault 内单仓。
const { ROOT, AI_ROOT, LIB_ROOT, fs, path, listMdIn, readNote, isoStr, stamp, isoWeek, CONTRACT } = require('./lib');
const { execSync } = require('child_process');

const today = stamp().slice(0, 10);
const lines = [];
const aiUp = fs.existsSync(AI_ROOT);


// 实例开关（_system/vault.json，可选）：本库是母版，复制出去的库按自身配置关掉不适用的哨兵
// （2026-09-01 模板化拍板）。没有该文件 = 全默认，母版行为不变。
let vcfg = {};
try { vcfg = JSON.parse(fs.readFileSync(path.join(ROOT, '_system', 'vault.json'), 'utf8')); } catch { /* 无配置即默认 */ }

// AI 仓到期任务（tasks/ frontmatter：due + status: open|done）——"不可漏"的机器兜底
if (aiUp) {
  const due = listMdIn(AI_ROOT, 'tasks').map(readNote)
    .filter(t => !t.parseError && t.data.status !== 'done' && t.data.due)
    .map(t => ({ name: path.basename(t.file, '.md'), d: isoStr(t.data.due).slice(0, 10) }))
    .filter(x => x.d <= today);
  if (due.length) lines.push(`⏰ 到期/过期任务 ${due.length}：${due.map(x => `${x.name}（due ${x.d}）`).join(' · ')}`);
} else {
  lines.push(`⚙️ 记忆区 ${AI_ROOT} 不存在——记忆断了，先查（basic-memory 项目 brain 指向是否正确）`);
}

// digest 排期：本周还没出，且 _ai/ 自上篇 digest 后有新动静 → 本场顺手出（空周自动沉默）
try {
  const cur = isoWeek();
  const digests = listMdIn(ROOT, 'digest').map(f => path.basename(f, '.md')).sort();
  const latest = digests[digests.length - 1];
  if (aiUp && latest !== cur.name) {
    let sinceArg = [];
    if (latest) {
      const d = readNote(path.join(ROOT, 'digest', latest + '.md')).data.date;
      // 显式带人时区偏移:git 对裸时间按机器本地时区(PDT)解释,会错移 15 小时(2026-08-27 审计 finding#7)
      let off = '+08:00';
      try {
        off = new Intl.DateTimeFormat('en-US', { timeZone: process.env.BRAIN_TZ || 'Asia/Shanghai', timeZoneName: 'longOffset' })
          .formatToParts(new Date()).find(p => p.type === 'timeZoneName').value.replace('GMT', '') || '+08:00';
      } catch { /* 旧 Node 不认 longOffset 就用默认 */ }
      if (d) sinceArg = [`--since=${isoStr(d).slice(0, 10)}T23:59${off}`];
    }
    const n = execSync(`git log --oneline ${sinceArg.join(' ')} -- _ai | wc -l`, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    if (+n > 0) lines.push(`🗞 本周 digest（${cur.name}）还没出，${latest ? `自 ${latest} 后` : '开张以来'} _ai/ 有 ${n} 个提交——本场顺手蒸一篇（流程见 CLAUDE.md）`);
  }
} catch { /* 非 git 等情况跳过 */ }

// inbox：剪藏（source: web）走机械搬运 ingest.js，不占 LLM；手记（其他 source）留会话分流（2026-09-02 拆两段）
try {
  const ib = listMdIn(ROOT, 'inbox').map(readNote);
  const clips = ib.filter(n => n.data.source === 'web').length, notes = ib.length - clips;
  if (clips) lines.push(`📥 inbox 剪藏 ${clips} 条未入库——跑 \`brain ingest --no-asr\` 机械搬进藏书房（无字幕 B 站留给夜里 ASR）`);
  if (notes) lines.push(`📥 inbox 手记 ${notes} 条待分流（私有洞见进 _ai/memory，整篇资料进 _ai/library，处理完删原文件）`);
} catch { /* 读失败跳过 */ }

// 藏书房积压：raw/ 里没有对应 source 页（frontmatter raw: 指回）的原文 = 收了没消化
if (fs.existsSync(LIB_ROOT)) {
  const consumed = new Set(listMdIn(LIB_ROOT, 'sources').map(readNote)
    .map(n => isoStr(n.data.raw)).filter(Boolean).map(r => path.basename(r)));
  const backlog = listMdIn(LIB_ROOT, 'raw').map(f => path.basename(f)).filter(b => !consumed.has(b));
  if (backlog.length) lines.push(`📚 藏书房待深消化 ${backlog.length} 篇（都带你的说明，说明进 Why collected、含判断的同时进记忆区；说「消化」就开工）：${backlog.slice(0, 3).join('、')}${backlog.length > 3 ? ' …' : ''}`);
}



// 巨页哨兵（轻版，详单在每日 lint）：人读层按域拆——超限就提拆分（_ai 区 150 行拆页 2026-10-25 取消）
// 人读层目录母版默认，实例在 vault.json 的 humanDirs 覆写（如 work 侧的「速查」）
try {
  const over = [];
  const chk = (f, max, hint) => { const n = fs.readFileSync(f, 'utf8').split('\n').length; if (n > max) over.push(`${path.relative(ROOT, f).split(path.sep).join('/')} ${n} 行（${hint}）`); };
  (vcfg.humanDirs || ['pages', 'digest', 'navigation', '_Private', '_system']).forEach(d => listMdIn(ROOT, d).forEach(f => chk(f, CONTRACT.MAX_LINES.human, '按域拆子页')));
  if (over.length) lines.push(`📏 巨页 ${over.length} 个待拆：${over.slice(0, 3).join('、')}${over.length > 3 ? ' …' : ''}`);
} catch { /* 缺目录/读失败跳过 */ }

// 提交滞留（快照 push 死亡检测）
try {
  const out = execSync("git log '@{u}..HEAD' --format=%ct", { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  if (out) {
    const ts = out.split('\n');
    if (Date.now() - +ts[ts.length - 1] * 1000 > 24 * 3600e3)
      lines.push(`📤 vault ${ts.length} 个本地提交滞留超 24h 未推送——快照 push 疑似失败（journalctl --user -u brain-daily 排查）`);
  }
} catch { /* 无上游/非 git */ }

// _ai/ 脏改动老化：checkpoint 链每轮会兜，未提交改动挂超 6h = 链断裂或同步踩踏（fast-note-sync 有吃档前科）
try {
  const dirty = execSync('git status --porcelain -z -- _ai', { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
    .split('\0').filter(Boolean);
  const aged = dirty.filter(e => {
    const f = path.join(ROOT, e.slice(3));
    return !fs.existsSync(f) || Date.now() - fs.statSync(f).mtimeMs > 6 * 3600e3;
  });
  if (aged.length) lines.push(`🚨 _ai/ 有 ${aged.length} 处未提交改动挂超 6h——checkpoint 链疑似断裂，当场 git 提交并查 Stop hook`);
} catch { /* 非 git */ }

// 每日链心跳（snap.js daily 每次 06:00 刷 _system/.lastrun-daily；超 30h = 定时器死亡）
// 复制体没装每日定时器时在 vault.json 里 daily:false 关掉本哨兵，否则每场误报
// daily 开关以注册表为准（brain register --no-daily），vault.json 的 daily 只是旧写法兜底
const regDaily = (() => { try { const v = require('./registry').vaultAt(ROOT); return v ? v.daily !== false : vcfg.daily !== false; } catch { return vcfg.daily !== false; } })();
if (regDaily) {
  const hb = path.join(ROOT, '_system', '.lastrun-daily');
  const hbAge = fs.existsSync(hb) ? Date.now() - fs.statSync(hb).mtimeMs : Infinity;
  if (hbAge > 30 * 3600e3)
    lines.push(`⚙️ 每日链心跳${hbAge === Infinity ? '未见（刚部署可忽略，明晨 06:00 后自动出现）' : `停在 ${stamp(new Date(fs.statSync(hb).mtimeMs))}`}——查 systemctl --user status brain-daily.timer`);
  else { try { const s = JSON.parse(fs.readFileSync(hb, 'utf8')); if (s.failed && s.failed.length) lines.push(`⚙️ 上次每日链有步骤失败：${s.failed.join('、')}——journalctl --user -u brain-daily 看原因`); } catch { /* 旧格式：纯时间戳 */ } }
}

// 快照哨兵：白名单外的顶层陌生路径（snap.js 拒收并记档）
const strangerFile = path.join(ROOT, '_system', '.snapshot-strangers');
if (fs.existsSync(strangerFile)) {
  const strangers = fs.readFileSync(strangerFile, 'utf8').trim().split('\n').filter(Boolean);
  if (strangers.length) lines.push(`🚧 顶层陌生路径未入快照：${strangers.join('、')}——gitignore / 挪走 / 或加进本库 vault.json 的 humanDirs（人读层目录即快照白名单）`);
}

// bm 多实例检测：正常只有 systemd 托管的共享服务 1 个（127.0.0.1:8000/mcp，Claude/Codex 共用）。
// 多出来的是客户端按 stdio 自己拉起的子进程（2026-10-25 查明：~/.codex/config.toml 曾配 stdio，每个 Codex 进程各拉一个 0.4–2 GB），
// 它们和共享服务抢同一个 SQLite（新笔记进索引报 database is locked）；2026-08-27 还见过 4 个并存 + watch 因 ~/Workspace 符号链接路径分裂崩溃。
// 按父进程区分，不按总数；不建议 pkill 整个模式——那会连共享服务和在用会话的 MCP 一起断。
try {
  const sh = c => execSync(c, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  // 只认进程名 basic-memory 且带 mcp 子命令的：按命令行文本 grep 会把恰好含这串字的 shell 也算进来
  // 共享服务按启动参数认（--transport streamable-http），不按父进程：父进程退出后孤儿 stdio 实例也会被 systemd 收养
  const rows = sh('ps -eo pid=,ppid=,comm=,args=').split('\n').map(l => l.trim().split(/\s+/))
    .filter(([, , comm, ...args]) => comm === 'basic-memory' && args.includes('mcp') && !args.includes('streamable-http'));
  const stray = rows.map(([pid, ppid]) => ({ pid, parent: sh(`ps -o comm= -p ${ppid} || true`) }));
  if (stray.length) lines.push(`⚙️ basic-memory 有 ${stray.length} 个客户端 stdio 子进程（${stray.map(r => `${r.pid}←${r.parent || '?'}`).join('、')}）——把对应客户端的 MCP 配置指向共享服务 http://127.0.0.1:8000/mcp，等会话空闲后只结束这几个 PID；别 pkill 整个模式`);
} catch { /* ps 不可用则跳过 */ }

// 接上文入口：记忆区最近的 journal
if (aiUp) {
  const recent = listMdIn(AI_ROOT, 'journal').map(f => path.basename(f, '.md')).sort().slice(-2);
  if (recent.length) lines.push(`📜 最近 journal：${recent.join('、')}`);
}

console.log(`[brain 状态简报 ${stamp()}]`);
console.log(lines.length ? lines.join('\n') : '✅ 无到期任务、无积压——正常开聊');
