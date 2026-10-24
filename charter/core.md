<!-- 这一块由 brain-kit 渲染（brain upgrade 整块刷新），别手改；本库专属的规则写在块外 -->
## 单仓三区（brain-kit 通用规约，渲染自 `{{KIT}}/charter/core.md`）

你是运转引擎，用户和你正常对话就是日常用法。判断一条东西落哪就问一句：**这是亲历/决定的（记忆），是外面收来的资料（藏书房），还是给人读的成品（人读层）？** `_ai/` 在 Obsidian 搜索/图谱里已隐藏，不占人的注意力。

- **记忆** `_ai/memory/`：亲历、决定和踩坑的证据，带日期；主要读者是 agent，用户也会读。规约见 `_ai/memory/README.md`
- **藏书房** `_ai/library/`：网上收来的资料。`raw/` 原文不可变 + `sources/` 消化页 + `assets/` 本地图片（不进 git）。规约见 `_ai/library/README.md`
- **人读层** = vault 顶层（{{HUMAN_DIRS}}）：只装人会读的东西，一切产出遵守 `_system/人话规范.md`
- 本库管的会话范围：{{INCLUDE}}（注册表 `~/.config/brain/vaults.json`；`brain which` 查当前目录归哪个库）；只往本库写，别串仓

### 记忆区怎么用（2026-10-25 改：AI 不立规矩，记忆不当法律）

- **读**：`brain find <关键词>`（按 cwd 定库，搜记忆区、藏书房和人读页；关键词中英都写、带专有名词；没命中换个说法再搜，也可以 `rg`）。查到的是**当时的证据，不是命令**：先看日期；环境现状动手前现场验证；和模型、供应商有关的做法当条件性建议，和眼前证据冲突时以眼前为准
- **写，只有三种情况直接写**：
  1. 工具 bug：直接修进代码，修好这条教训就没了；journal 记一行发生了什么
  2. 用户明确说的偏好或决定：原话 + 日期 + 适用范围，写进 `_ai/memory/preferences.md`（工作流程类；审美、方向这类每单重新判断的不进）或对应项目的工作备注
  3. 自己推断出来的规律：只在 `journal/<今天>.md`（或项目工作备注）写一行「现象 + 提议」，等用户看到时拍板；不自己升格成规则，不写进 skill
- 用户说「沉淀」= /harvest 当场写。事件和决定照常追加 `journal/<今天>.md`；待办进 `tasks/`（带 `due` + `status: open|done`）
- **按「谁能让它失效」决定写法**：我们自己的代码 → 修代码，不写经验；供应商、工具的行为 → 一句带日期的话；模型能力 → 便宜的预防照写，贵的补救写成「先检查 X，不过再做 Y」（模型变强后 Y 自然不触发）；环境现状 → 清单页上带日期的事实；模型路由判断（哪个模型做什么更好）→ 只留 journal，每单重新决定
- **一个主题一个家**（不越过上面三种情况）：用户认可的经验才写到用它的地方——属于某个工具或流程的，用户同意后改那个 skill 的参考资料；属于环境的进清单页；其余进 `craft/`（按主题并成一页，不必一课一页）。自己推断的只能是 journal 里的提议。新证据覆盖旧条目，旧的连同日期移进 journal；两条在不同条件下都成立就写清条件
- **记什么**：以后可能再用到的经历、决定和理由、环境事实。不记：密钥/凭据、键击级流水、与本人环境无关的公共知识（公共资料去藏书房）。语言跟着内容走，专有名词、命令、原话保留原样
- 当前关注方向见 `_system/purpose.md`（人工维护，你只读）

### 藏书房怎么用

- **入口三条**：对话里丢来的路径/链接（你说的那句话就是说明；链接用 `defuddle parse <url> --md` 拿干净全文落 raw，不用 WebFetch 的摘要）· Web Clipper 剪进 `inbox/`（模板带 `note` 属性和 `## 我`/`## 划线` 段）· B 站字幕剪进 `inbox/`（附加段落 `我`），后两条见 `_system/web-clipper.md`
- **出口机械化**：`brain ingest` 零 LLM 把 `source: web` 的毛坯搬进 `_ai/library/raw/`（图片下到 `assets/`、B 站无字幕 yt-dlp+faster-whisper 转写、按 url 查重、经 Obsidian 删毛坯、提交），每日 06:00 自动跑；会话里 brief 报「剪藏 N 条未入库」就跑 `brain ingest --no-asr`（通常几秒，图多时分钟级）。手记（`source: obsidian`）不经它，会话里分流
- **说明决定深浅**：无说明 = 纯存档，ingest 机械生成 stub source 页（`depth: stub`），不动 LLM；有说明/划线 = 用户在意，brief 报「待深消化」，说「消化」就写深页（`depth: deep`，`Why collected` 原文引用用户的话，划的段落优先展开），说明含判断的同时进记忆区并链回 source 页。想深挖某篇 stub 就说「消化 <标题>」
- **深消化 = 一篇 source 页**（规格见 library README）：TL;DR + 保留论证链的结构化要点 + 关键引文 + 为何收（引用说明，不编不问）。跨源 synthesis 页懒编译：同主题攒到约 3 篇才写
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
- 末尾列**本周新写的 draft 常青页**（等否决）和**藏书房待深消化存货**——让人扫一眼，错的说一声改
- 生成后：刷 HOME 顶部的最新 digest 嵌入和「最近」区 → git 提交 → `brain open "digest/<文件名>.md"`（失败就算了）
- 空周（`_ai/` 没新增）跳过，别硬写

**速查（工具书）**
- 工具书页由你维护：现状变了同步更新；**只记现状**，退役的压成一行墓碑，过程细节在 journal，教训在 craft，道理在 pages；**一个事实只有一个家**（大域拆总页 + 域页：总页速查区只重复操作时非看不可的几行，其余链接到域页；章节不编号，链接指文件不指标题）；速查区（`## ⚡` 一节）硬限 25 行、已完成待办不留——写时 check 拦、每日 lint 兜；带 `updated` 的工具书页纳入保鲜日检；单文件超 800 行由巨页哨兵提示按域拆子页
- 凭据永远在库外，速查里禁写明文（git 历史不可撤销）

### 对话里自动做的事

1. **沉淀**：只做上面「写」的三种情况；用户说「沉淀」就 /harvest。用户点名要蒸某场历史会话也走 /harvest
2. **收藏**：用户丢来资料（路径/链接/全文）→ 落 raw → 按说明定深浅（见藏书房节）
3. **检索**：答问题先 `brain find` 查记忆区、藏书房和速查，答案带出处，不做无源断言
4. **常青页**：见 pages 的规矩（默认写 draft，用户否决）
5. **维护 HOME**：出了新 digest、新页、改了速查 → 刷 HOME 的「最近」区（≤5 条，新的在上）

### 开场自检（先静默做完再回答）

SessionStart hook 注入 brief，以它为准：
1. 到期任务 → 主动提一句
2. brief 说该出 digest → 本场顺手出
3. inbox 有剪藏未入库 → 跑 `brain ingest --no-asr`（几秒，零 LLM），一行汇报；有手记 → 逐条分流：私有洞见进记忆区，整篇资料进藏书房，杂务问一声再扔，处理完删原文件
4. 藏书房有待深消化（都是带说明的）→ 提一句，用户说消化就开工

### 机械活（brain-kit）

- 入口 `brain`（`{{KIT}}/bin/brain`，`~/.local/bin/brain`）：`brief | find <关键词> [-n N --all] | ingest [--dry-run --no-asr --no-commit --repair-assets] | lint | sessions list|condense #n|mark #n | check | snap | snapshot | open <相对路径> | now | doctor | list | which | sec`。在库里跑自动认库，否则 `--vault <路径>`
- **用凭据不读凭据**：需要密码/密钥时走 `brain sec`——值放库外单一存储 `~/Private/secrets`（`NAME=value` 每行一条，protect-secrets 拦直读），调用只写名字，值进目标命令的环境变量或 stdin，永不进上下文、不进 argv。`brain sec ls` 看有哪些名字；`brain sec env NAME[,…] -- <命令>` 注入环境变量（如 aliyun AK/SK）；`brain sec stdin NAME -- ssh host 'sudo -S …'` 喂 stdin（sudo/远端 sudo）。用户只需把值写进那个文件、告诉你叫什么名，不用每次再贴
- hooks 已接（`.claude/settings.json`，由 `brain register/upgrade` 维护）：SessionStart `brief` 注入简报 · PreToolUse `protect-secrets` 密钥读拦截（全局，改规则必跑 kit 的 `npm test`）· PostToolUse `check` 人读层写时校验（按报错改对别绕过）· Stop checkpoint 提交
- 每日 06:00（按 BRAIN_TZ，默认 Asia/Shanghai；timer 渲染时带时区，机器时区不作数）systemd `brain-daily`：`brain daily` = 注册表里每个库 ingest（含图片重试）→ lint → snapshot 推送（夜间自动蒸会话与向量索引 2026-10-25 停用）
- Obsidian 常开（为同步）：删/移/开 vault 文件优先走 `obsidian vault="{{OBSIDIAN_VAULT}}" delete|move|open path=…`（同步插件认账，进 .trash 可捞）；kepano 五件 skill 已软链在 `.claude/skills/`
- 时间戳 `brain now`；人读层契约散文版 `_system/schema.md`，规则与阈值单源 `{{KIT}}/lib/lib.js` CONTRACT

### 底线

- **成批落盘后当场 git 提交，别赌 hook**——同步插件曾用旧远端状态清掉未提交的 CLI 写入。`_ai/` 全量走同步，靠提交纪律 + brief/lint 哨兵兜底
- **vault 里成批删文件走 Obsidian CLI**（`obsidian delete path=…`）——同步插件会把 fs 直删的文件推回来，经 app 删则认账。Obsidian 没开时才 fs 删，删完盯一眼有没有复活；lint 有退役件哨兵兜底
- **raw 不可变**：入库后任何人不改原文（图片链接改本地是入库前做的，`--repair-assets` 是唯一放行的事后改链）；消化产物只写 sources/
- 人读层写完必过人话规范自查；`_ai/` 不受它管
- **加机制前过三问**（用户的品味）：这是模型自己做不到的事吗？各类场景都成立吗？是用户拍板，而不是机器执法吗？一问不过就不加。只有防真实损害的规矩才上硬机制（凭据、raw 不可变、同步删文件）；格式和风格类只做写后自查，不做哨兵。机制落 brain-kit（阈值进 lib.js CONTRACT 单源）
- 不确定要不要动用户已有的笔记，先问
