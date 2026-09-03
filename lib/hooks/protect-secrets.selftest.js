'use strict';
// protect-secrets 的回放自测(机制学 ai-second-brain-template:真实 spawn hook 进程回放用例,
// 断言 block=exit 2 / allow=exit 0,证明护栏真的在拦而不是摆设)。改 RULES 后必跑。
// 用法:node brain-tools/hooks/protect-secrets.selftest.js
const { spawnSync } = require('child_process');
const path = require('path');
const HOOK = path.join(__dirname, 'protect-secrets.js');

const CASES = [
  // —— 必须拦 ——
  ['block', 'Read', { file_path: '/home/raul/Private/key.md' }],
  ['block', 'Read', { file_path: '/home/raul/Private/_secret/aliyun-key.txt' }],
  ['block', 'Bash', { command: 'cat ~/Private/_secret/foo && echo done' }],
  ['block', 'Bash', { command: 'ls ~/Private' }],
  ['block', 'Read', { file_path: '/mnt/workspace/Raul/Obsidian Vault/brain-tools/.env' }],
  ['block', 'Read', { file_path: '/home/raul/Code/x/.env.local' }],
  ['block', 'Bash', { command: 'xxd brain-tools/.env | head' }],
  ['block', 'Bash', { command: 'cat .env' }],
  ['block', 'Bash', { command: 'source ./.env' }],
  ['block', 'Bash', { command: 'base64 .obsidian/plugins/obsidian-local-rest-api/data.json' }],
  ['block', 'Read', { file_path: '/mnt/workspace/Raul/Obsidian Vault/.obsidian/plugins/fast-note-sync/data.json' }],
  ['block', 'Bash', { command: 'cat ~/.ssh/id_rsa' }],
  ['block', 'Bash', { command: 'cp id_ed25519 /tmp/x' }],
  ['block', 'Bash', { command: 'cp ~/.aws/credentials /tmp/x' }],
  ['block', 'Bash', { command: 'openssl rsa -in ~/Private/aliyun.pem' }],
  ['block', 'Grep', { pattern: 'key', path: '/home/raul/Private' }],
  // Grep 的 glob 参数形态(2026-08-27 审计 finding#6 补洞)
  ['block', 'Grep', { pattern: 'SECRET', glob: '**/.env' }],                     // glob 单独指向密钥文件
  ['block', 'Grep', { pattern: 'key', path: '/home/raul', glob: 'Private/**' }], // path+glob 拼合才命中的形态
  ['allow', 'Grep', { pattern: 'todo', glob: '**/*.md' }],
  // HOME 变量形态 + git 凭据 + Glob pattern(2026-08-11 审计补洞)
  ['block', 'Bash', { command: 'cat "$HOME/Private/key.md"' }],
  ['block', 'Bash', { command: 'cat ${HOME}/Private/id.txt' }],
  ['block', 'Bash', { command: 'cat .git/.git-credentials' }],
  ['block', 'Read', { file_path: '/mnt/workspace/Raul/Obsidian Vault/.git/.git-credentials' }],
  ['block', 'Read', { file_path: '/home/raul/.git-credentials' }],
  ['block', 'Glob', { pattern: '/home/raul/Private/**' }],
  // .ssh 放行 authorized_keys/known_hosts 之后,私钥与整目录必须照拦(2026-08-24 收窄的边界)
  ['block', 'Bash', { command: 'ls ~/.ssh/' }],                                  // 目录:文件名也不该进上下文
  ['block', 'Bash', { command: 'cat /home/raul/.ssh/id_ed25519' }],              // 私钥:绝对路径形态
  ['block', 'Bash', { command: 'cat ~/.ssh/rescue-tunnel' }],                    // 私钥:非 id_* 命名,靠目录规则兜住
  ['block', 'Bash', { command: 'cat ~/.ssh/authorized_keys && cat id_ed25519' }],// 混合:公钥文件不能成为私钥的挡箭牌
  // —— 必须放(库内 _Private 速查区是 AI 维护的,恰是最易误伤处)——
  // authorized_keys / known_hosts 按定义只含公钥,不含秘密;配反向隧道、加部署公钥天天要碰
  ['allow', 'Bash', { command: 'cat ~/.ssh/authorized_keys' }],
  ['allow', 'Bash', { command: 'ssh root@vps "cat /home/rescue-tunnel/.ssh/authorized_keys"' }],
  ['allow', 'Bash', { command: 'ssh-keyscan -t ed25519 1.2.3.4 >> $HOME/.ssh/known_hosts' }],
  ['allow', 'Read', { file_path: '/mnt/workspace/Raul/Obsidian Vault/_Private/自建网络服务清单.md' }],
  ['allow', 'Grep', { pattern: 'private', path: '/mnt/workspace/Raul/Obsidian Vault/_Private' }],
  ['allow', 'Read', { file_path: '/mnt/workspace/Raul/Obsidian Vault/notes/20260806T2058-瑕疵扣分制下满分是绝对标准.md' }],
  ['allow', 'Bash', { command: 'git status && git log --oneline -3' }],
  ['allow', 'Bash', { command: 'cat .obsidian/core-plugins.json' }],
  ['allow', 'Read', { file_path: '/home/raul/Code/proposal/.env.example' }],
  ['allow', 'Bash', { command: 'npm run daily-full' }],
  ['allow', 'Bash', { command: "git commit -m '护栏拦密钥区(~/Private、.env、插件 data.json)'" }], // 散文提及≠读取(首拦 FP 案例)
  ['allow', 'Bash', { command: "git commit -m '护栏新增 git-credentials 与 HOME 变量拦截'" }], // 同上:凭据规则的散文形态
  ['allow', 'Bash', { command: 'echo $HOME && whoami' }],
  ['allow', 'Glob', { pattern: '**/*.md' }],
  ['allow', 'Write', { file_path: '/home/raul/Private/x.md' }], // 非监听工具:matcher 不含 Write,hook 收到也放行
];

let fail = 0;
for (const [expect, tool_name, tool_input] of CASES) {
  const res = spawnSync(process.execPath, [HOOK], {
    input: JSON.stringify({ tool_name, tool_input }),
    encoding: 'utf8',
    env: { ...process.env, PROTECT_SECRETS_NO_LOG: '1' },
  });
  const got = res.status === 2 ? 'block' : 'allow';
  const ok = got === expect;
  if (!ok) fail++;
  console.log(`${ok ? '✅' : '❌'} [期望 ${expect} → 实际 ${got}] ${tool_name} ${JSON.stringify(tool_input).slice(0, 100)}`);
}
// 载荷变形:放行且不崩(载荷格式变化不应瘫痪全部工具)
const weird = spawnSync(process.execPath, [HOOK], { input: '不是JSON', encoding: 'utf8', env: { ...process.env, PROTECT_SECRETS_NO_LOG: '1' } });
const wOk = weird.status === 0;
if (!wOk) fail++;
console.log(`${wOk ? '✅' : '❌'} [期望 allow → 实际 ${wOk ? 'allow' : 'block'}] 载荷解析失败时放行`);

console.log(fail === 0 ? `\n✅ 全部 ${CASES.length + 1} 用例通过` : `\n❌ ${fail} 个用例失败`);
process.exit(fail === 0 ? 0 : 1);
