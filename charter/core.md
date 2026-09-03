<!-- 这一块由 brain-kit 渲染（brain upgrade 整块刷新），别手改；本库专属的规则写在块外 -->
## 单仓三区（brain-kit 通用规约，渲染自 `{{KIT}}/charter/core.md`）

你是运转引擎，用户和你正常对话就是日常用法。判断一条东西落哪就问一句：**这是亲历/决定的（记忆），是外面收来的资料（藏书房），还是给人读的成品（人读层）？** `_ai/` 在 Obsidian 搜索/图谱里已隐藏，不占人的注意力。

- **记忆** `_ai/memory/`（basic-memory 项目 `{{MEMORY_PROJECT}}`）：你的经验与流水，写给检索，人永远不看。规约见 `_ai/memory/README.md`
- **藏书房** `_ai/library/`（basic-memory 项目 `{{LIBRARY_PROJECT}}`）：网上收来的资料。`raw/` 原文不可变 + `sources/` 消化页 + `assets/` 本地图片（不进 git）。规约见 `_ai/library/README.md`
- **人读层** = vault 顶层（{{HUMAN_DIRS}}）：只装人会读的东西，一切产出遵守 `_system/人话规范.md`
- 本库管的会话范围：{{INCLUDE}}（注册表 `~/.config/brain/vaults.json`）；MCP 写入显式带 `project: {{MEMORY_PROJECT}}`，别串仓

### 记忆区怎么用

- **写**：直接写 md 进 `_ai/memory/`（craft/ 经验 · playbooks/ 打法 · journal/ 事件流水 · tasks/ 待办带 `due`+`status: open|done`），格式见其 README。**一律用英文写**（证据原文引用与专有名词保留原语言）
- **教训必拆页**：journal 里每条 `[lesson]` 同时落一篇 `craft/` 短页（一课一页、自包含、带日期、Relations 连回 journal 与它喂的人读层页），journal 只留事件和链接。brief/lint 有 lesson 对 craft 的缺口哨兵
- **读**：优先 basic-memory MCP 检索（项目 `{{MEMORY_PROJECT}}`）；没有就 Grep `_ai/memory/`
- **准入黑名单制**：默认记录、宁多勿缺——亲历、尝试（含失败的）、决定与理由、环境事实、用户偏好、待验证猜测（标明是猜测）都进。只排除三类：①与本人环境零绑定的纯公共知识（公共资料去藏书房）②密钥/凭据 ③键击级流水（journal 记到事件级）。状态型事实带日期；改判用 edit 修正旧稿，不留误导版本
- **一实体一页**：craft/playbooks 单页过约 150 行就按子题拆、Relations 连边；journal 按日豁免
- 当前关注方向见 `_system/purpose.md`（人工维护，你只读）

### 藏书房怎么用

- **入口三条**：对话里丢来的路径/链接（你说的那句话就是说明；链接用 `defuddle parse <url> --md` 拿干净全文落 raw，不用 WebFetch 的摘要）· Web Clipper 剪进 `inbox/`（模板带 `note` 属性和 `## 我`/`## 划线` 段）· B 站字幕剪进 `inbox/`（附加段落 `我`），后两条见 `_system/web-clipper.md`
- **出口机械化**：`brain ingest` 零 LLM 把 `source: web` 的毛坯搬进 `_ai/library/raw/`（图片下到 `assets/`、B 站无字幕 yt-dlp+faster-whisper 转写、按 url 查重、经 Obsidian 删毛坯、提交），每日 06:00 自动跑；会话里 brief 报「剪藏 N 条未入库」就跑 `brain ingest --no-asr`（通常几秒，图多时分钟级）。手记（`source: obsidian`）不经它，会话里分流
- **说明决定深浅**：无说明 = 纯存档，ingest 机械生成 stub source 页（`depth: stub`），不动 LLM；有说明/划线 = 用户在意，brief 报「待深消化」，说「消化」就写深页（`depth: deep`，`Why collected` 原文引用用户的话，划的段落优先展开），说明含判断的同时进记忆区并链回 source 页。想深挖某篇 stub 就说「消化 <标题>」
- **深消化 = 一篇 source 页**（英文，规格见 library README）：TL;DR + 保留论证链的结构化要点 + 关键引文 + 为何收（引用说明，不编不问）。跨源 synthesis 页懒编译：同主题攒到约 3 篇才写
- **准入 = 策展**：用户收的就进，不设第二道刀；误剪照样成 stub，digest 点名时用户说删再删（raw + stub + assets 目录一起）
- **raw 落定后不可变**（lint 有哨兵）；引用资料答问题时带 source 页或 raw 的依据。图片在 `_ai/library/assets/` 本机不进 git，音视频在 `{{MEDIA}}/`；`_system/vault.json` 的 `assetsBackup` 填了就每日 rsync 备份

### 人读层三种形态

**pages/ 常青页（默认写、用户否决）**
- 动笔时机：同类经验攒到约 3 条，或一件事收尾。**直接写**，frontmatter 加 `status: draft`，HOME「最近」区列出来；用户看到不要就说删。用户明确点头或改过一次就去掉 `draft`
- 同主题只有一页：新经验来了更新那页（frontmatter 刷 `updated`），不另起新篇
- frontmatter：`type: page` + `updated: YYYY-MM-DD`（+ 可选 `status: draft`）。体例：先结论后展开；事实要么永恒、要么带日期、要么是指针

**digest/ 周报（推送）**
- 每周第一场会话（brief 会提示）：把上周 `_ai/` 新增（journal + craft + 藏书房入库 + git log）蒸成一篇科普 blog 体的小结，存 `digest/<年>-W<周>.md`（`type: digest` + `date`）。形式跟内容走（体例见人话规范）
- 末尾带一两条**回响**：从记忆区或藏书房挑与本周相关的旧内容重浮
- 末尾列**本周新写的 draft 常青页**（等否决）、**藏书房待深消化存货**、**本周自动捞的记忆条目**（craft/tasks 看 frontmatter `provenance: auto-harvest`，journal 看 `auto-harvest` 前缀的条）——让人扫一眼，错的说一声改
- 生成后：刷 HOME 顶部的最新 digest 嵌入和「最近」区 → git 提交 → `brain open "digest/<文件名>.md"`（失败就算了）
- 空周（`_ai/` 没新增）跳过，别硬写

**速查（工具书）**
- 工具书页由你维护：现状变了同步更新；**只记现状**，退役的压成一行墓碑，过程细节在 journal；单文件超 800 行由巨页哨兵提示按域拆子页
- 凭据永远在库外，速查里禁写明文（git 历史不可撤销）

### 对话里自动做的事

1. **沉淀**：遇事就记（不踩排除三类就进）随手写记忆区，落完一行轻提示；事件/决定追加 `journal/<今天>.md`；教训同时落 `craft/` 一页；任务进 `tasks/` 带 due。**顺手挖**：用户提到做成/搞砸/做了决定，追问一句关键细节（一次只追一句）。**沉淀时机不靠人记**：vault 外的会话由夜间 `brain daily` 的 harvest-sweep 自动捞（起点是上次捞到或会话自己最后一次写记忆区的轮次，之后又续 ≥6 轮就再捞新增段），brief 报「未捞会话」；用户说「捞 #n」就 `brain sessions condense #n` 读浓缩稿、按 /harvest 落盘、`brain sessions mark #n manual` 登记
2. **收藏**：用户丢来资料（路径/链接/全文）→ 落 raw → 按说明定深浅（见藏书房节）
3. **检索**：答问题先查记忆区、藏书房和速查，给答案带依据，不做无源断言
4. **常青页**：见 pages 的规矩（默认写 draft，用户否决）
5. **维护 HOME**：出了新 digest、新页、改了速查 → 刷 HOME 的「最近」区（≤5 条，新的在上）

### 开场自检（先静默做完再回答）

SessionStart hook 注入 brief，以它为准：
1. 到期任务 → 主动提一句
2. brief 说该出 digest → 本场顺手出
3. inbox 有剪藏未入库 → 跑 `brain ingest --no-asr`（几秒，零 LLM），一行汇报；有手记 → 逐条分流：私有洞见进记忆区，整篇资料进藏书房，杂务问一声再扔，处理完删原文件
4. 藏书房有待深消化（都是带说明的）→ 提一句，用户说消化就开工；brief 报未捞会话 → 提一句，不主动捞（夜里会捞）

### 机械活（brain-kit）

- 入口 `brain`（`{{KIT}}/bin/brain`，`~/.local/bin/brain`）：`brief | ingest [--dry-run --no-asr --no-commit --repair-assets] | lint | sweep [--dry-run --limit N --file <jsonl>] | sessions list|json|condense #n|mark #n | check | snap | snapshot | open <相对路径> | now | doctor | list | which`。在库里跑自动认库，否则 `--vault <路径>`
- hooks 已接（`.claude/settings.json`，由 `brain register/upgrade` 维护）：SessionStart `brief` 注入简报 · PreToolUse `protect-secrets` 密钥读拦截（全局，改规则必跑 kit 的 `npm test`）· PostToolUse `check` 人读层写时校验（按报错改对别绕过）· Stop checkpoint 提交
- 每日 06:00（按 BRAIN_TZ，默认 Asia/Shanghai；timer 渲染时带时区，机器时区不作数）systemd `brain-daily`：`brain daily` = 注册表里每个库 ingest（含图片重试）→ harvest-sweep（每晚 ≤3 场未捞会话，独立 `claude -p` 实例只放行读与写 `_ai/memory/**`，读打过码的浓缩稿；捞过的会话又续了 ≥6 轮只捞新增段；产物标 `provenance: auto-harvest`；关：`_system/vault.json` `harvest.enabled: false`）→ lint → snapshot 推送
- Obsidian 常开（为同步）：删/移/开 vault 文件优先走 `obsidian vault="{{OBSIDIAN_VAULT}}" delete|move|open path=…`（同步插件认账，进 .trash 可捞）；kepano 五件 skill 已软链在 `.claude/skills/`
- 时间戳 `brain now`；人读层契约散文版 `_system/schema.md`，规则与阈值单源 `{{KIT}}/lib/lib.js` CONTRACT

### 底线

- **成批落盘后当场 git 提交，别赌 hook**——同步插件曾用旧远端状态清掉未提交的 CLI 写入。`_ai/` 全量走同步，靠提交纪律 + brief/lint 哨兵兜底
- **vault 里成批删文件走 Obsidian CLI**（`obsidian delete path=…`）——同步插件会把 fs 直删的文件推回来，经 app 删则认账。Obsidian 没开时才 fs 删，删完盯一眼有没有复活；lint 有退役件哨兵兜底
- **raw 不可变**：入库后任何人不改原文（图片链接改本地是入库前做的，`--repair-assets` 是唯一放行的事后改链）；消化产物只写 sources/
- 人读层写完必过人话规范自查；`_ai/` 不受它管，检索友好第一
- **立新规矩当场配约束**：每定一条规矩先问「能不能上机制」——能写时硬拦的进 check/protect-secrets，能日检的进 lint 哨兵，该开场提醒的进 brief，纯判断类才留规约文字。机制一律落 brain-kit（阈值进 lib.js CONTRACT 单源），所有库即时生效
- 不确定要不要动用户已有的笔记，先问
