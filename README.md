# brain-kit

个人 AI 知识系统 **brain**（单仓三区：记忆 / 藏书房 / 人读层）的机制层。**这个仓不装任何内容**，只有脚本、规约通用块、空库骨架和全局接线；它按一份注册表服务这台机器上的任意多个 vault（Claude Code 与 Codex 共用）。

```
bin/brain            统一入口（软链到 ~/.local/bin/brain）
lib/                 机制脚本：brief 简报 · check 写时契约 · lint 日检 · snap/snapshot 提交 · ingest 藏书房入库 ·
                     sessions 会话扫描/浓缩/登记 · harvest-sweep 夜间自动捞 · recall 开场回忆 · registry 注册表 · hooks/protect-secrets 密钥读拦截
skills/              harvest（沉淀）+ kepano obsidian-skills 五件（markdown / bases / canvas / cli / defuddle）
charter/core.md      各库 CLAUDE.md 里的通用块（brain-kit:core 标记内，brain upgrade 整块刷新）
templates/vault/     空库骨架（brain init 铺）· templates/global/ 全局片段与 systemd unit
```

注册表 `~/.config/brain/vaults.json`：每台机器一份，记这台机器上有哪些 vault、各自管哪些 cwd（`include` 前缀；没有 include 的是默认库）、要不要每日跑。库自身的设置（basic-memory 项目名、人读层目录、自动捞旋钮、图片备份目录）在各库 `_system/vault.json`，随库走。

## 装

```bash
git clone git@github.com:wenyudi/brain-kit.git ~/Workspace/Raul/Code/brain-kit
cd ~/Workspace/Raul/Code/brain-kit && npm i
node bin/brain init  ~/Vaults/MyBrain --project mybrain --library mybrain-library --default      # 新库：铺骨架 + 登记 + 接线
node bin/brain register "/path/to/Existing Vault" --project work --include ~/Workspace/Work        # 已有库：只登记 + 接线
brain doctor
```

`register` 做的事：写注册表；补 `_system/vault.json`；写该库 `.claude/settings.json` 的 hooks（SessionStart brief / PostToolUse check / Stop checkpoint，指向本 kit，`BRAIN_ROOT="$CLAUDE_PROJECT_DIR"`）；把 kepano skills 软链进 `.claude/skills/`；渲染 CLAUDE.md 的通用块；给 basic-memory 建项目（失败会提示手动命令）；然后刷全局：`~/.claude/CLAUDE.md` 与 `~/.codex/AGENTS.md` 的通用块、全局 hooks（protect-secrets、recall）、Codex 护栏适配器、harvest skill 软链、systemd `brain-daily`（06:00）、`~/.local/bin/brain`。

外部依赖（`brain doctor` 会查）：Node ≥18、Claude Code CLI（自动捞用）、basic-memory 共享服务 `127.0.0.1:8000/mcp`、Obsidian ≥1.12 常开（CLI 删/开文件）、`yt-dlp ffmpeg curl`、`defuddle`（`npm i -g defuddle`）、faster-whisper venv（`python3 -m venv ~/.local/share/brain-asr/.venv && …/pip install faster-whisper`，预下载 medium 模型）。

## 日常

- 库里开 `claude` 就是全部用法：SessionStart 注入简报，对话里自动沉淀/收藏/检索，写人读层时 check 拦契约，Stop 自动 checkpoint
- `brain daily`（systemd 06:00）：每个库 ingest → harvest-sweep → lint → snapshot；`brain ingest --dry-run`、`brain sweep --dry-run`、`brain lint` 随时手动
- 机制升级：改 `lib/` 或 `charter/core.md`，`git pull` 后 `brain upgrade` 刷所有库的通用块 / hooks / 软链 / 全局接线
- 规则与阈值单源：`lib/lib.js` 的 `CONTRACT`；改护栏规则必跑 `npm test`

## 设计要点

- **机制与内容分离**：内容库各自 git、各自远端、各自准入规则（工作/个人脱钩）；机制只有一份，零拷贝，升级即全体生效
- **沉淀不靠人记**：会话扫描 + 夜间独立实例自动捞，白天的会话不被打断；产物带 `provenance: auto-harvest`
- **inbox 出口机械化**：剪藏零 LLM 入库，只有用户写了说明的资料才花 LLM 深消化
- **立规矩配约束**：能硬拦的进 check/protect-secrets，能日检的进 lint，该开场提醒的进 brief，纯判断类才留规约文字
- **Obsidian 常开**：删/移/开文件走官方 CLI，让同步插件认账
