'use strict';
// PreToolUse hook:读时密钥护栏(2026-08-10 上线;机制参考 compabob hook-protect-secrets 与
// ai-second-brain-template security-guardrails,代码自写,MIT 无涉)。
// 拦截 Read/Grep/Glob 的目标路径、Bash 的命令文本中对密钥区的引用 → exit 2 阻断,stderr 喂回引擎。
// 定位:护栏不是沙箱——防"顺手误读进上下文",不防蓄意绕过(绕过手段无穷,别在这卷)。
// 改 RULES 后必须跑:node brain-tools/hooks/protect-secrets.selftest.js
const fs = require('fs');
const path = require('path');

// 注意:~/Private 是库外密钥区(拦);库内 _Private/ 是速查文档(不拦)——正则锚在 home 根,天然区分。
// home 前缀三态:~ / $HOME(可带花括号) / 绝对路径——agent 顺手写 $HOME 是高频习惯,漏了就是白拦(2026-08-11 审计 finding#4)
const RULES = [
  { name: '~/Private 密钥区(_secret/、key.md、aliyun.pem)', re: /(?:~|\$\{?HOME\}?|\/home\/[\w.-]+)\/Private(?:\/|$|["'\s])/ },
  // .env 锚在路径前缀(行首/斜杠/空白/引号/=/括号),避免 commit message 等散文里提及 ".env" 字样被误拦(2026-08-11 首拦即 FP 的教训)
  { name: '.env 密钥文件', re: /(?:^|[\/\s'"=(])\.env\b(?!\.example)/ },
  { name: 'Obsidian 插件密钥(data.json:REST API key/LiveSync 凭据)', re: /\.obsidian\/plugins\/[^\/'"\s]+\/data\.json/ },
  // git credential store:本库 .git/config 配了 store --file=.git/.git-credentials,明文 PAT 就在库树内(2026-08-11 审计 finding#1)
  // 锚点/或.前缀:路径形态必带(如 ".git/…"、"~/.git-credentials"),散文提及(空格前缀)放行
  { name: 'git 凭据文件(git-credentials 明文 PAT)', re: /[\/.]git-credentials\b/ },
  // .ssh/ 整目录照拦(含 `ls ~/.ssh/`:文件名本身也不该顺手进上下文),
  // 但 authorized_keys / known_hosts 例外放行 —— 这两个文件按定义只含**公钥**,
  // 不含任何秘密,而配置反向隧道、加部署公钥这类运维动作天天要碰它们(2026-08-24 误拦)。
  // 放行只对"路径正好指向这两个文件"生效;命令里但凡另外出现 id_rsa/id_ed25519/id_ecdsa,
  // 仍会被后半段那条捕获 —— 所以 `cp authorized_keys x && cat id_ed25519` 照样拦。
  { name: 'SSH 私钥', re: /(?:~|\$\{?HOME\}?|\/home\/[\w.-]+)\/\.ssh(?:\/(?!authorized_keys\b|known_hosts\b)|$|["'\s])|(?:^|[\/\s'"])id_(?:rsa|ed25519|ecdsa)\b/ },
  { name: '云凭据(.aws/.pem)', re: /(?:~|\$\{?HOME\}?|\/home\/[\w.-]+)\/\.aws(?:\/|$|["'\s])|\.pem\b/ },
];

// RULES 可被外部适配器复用(codex 侧 ~/.codex/hooks/protect-secrets-codex.js,2026-08-27);
// require 本文件只拿规则表,不执行拦截主逻辑
module.exports = { RULES };
if (require.main !== module) return;

let payload;
try { payload = JSON.parse(fs.readFileSync(0, 'utf8')); }
catch { console.error('protect-secrets:hook 载荷解析失败,本次放行(载荷变形不应瘫痪全部工具)'); process.exit(0); }

const tool = payload.tool_name || '';
const ti = payload.tool_input || {};
const targets =
  tool === 'Bash' ? [ti.command] :
  tool === 'Read' ? [ti.file_path] :
  // Grep 的 glob 参数同样能指向密钥区;path+glob 拼合形态单看任一都不命中,要拼起来查(2026-08-27 审计 finding#6)
  tool === 'Grep' ? [ti.path, ti.glob, ti.path && ti.glob ? `${ti.path}/${ti.glob}` : ''] :
  tool === 'Glob' ? [ti.path, ti.pattern] : []; // Glob 的 pattern 可写绝对路径列密钥区文件名,一并查(审计 finding#4)

for (const raw of targets) {
  const t = String(raw || '');
  if (!t) continue;
  for (const r of RULES) {
    if (!r.re.test(t)) continue;
    if (!process.env.PROTECT_SECRETS_NO_LOG) {
      try {
        fs.appendFileSync(path.join(__dirname, 'blocks.jsonl'),
          JSON.stringify({ ts: new Date().toISOString(), tool, rule: r.name, target: t.slice(0, 200) }) + '\n');
      } catch { /* 日志失败不影响拦截 */ }
    }
    console.error(`🔒 protect-secrets:命中「${r.name}」,已阻断 ${tool}。密钥永远在库外、不进上下文(见 navigation/基建.md);确需查看请用户人工开终端。误拦则改 brain-tools/hooks/protect-secrets.js 的 RULES 并跑 selftest。`);
    process.exit(2);
  }
}
process.exit(0);
