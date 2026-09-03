# Web Clipper 接入 brain —— 网页数据的统一前门

> 网页上的资料基本只用 [Obsidian Web Clipper](https://obsidian.md/help/web-clipper) 获取。本文把它接进 brain：剪藏 → `inbox/` 毛坯 → **`brain ingest` 机械搬运**（每日 06:00 自动跑，会话里也可随手跑）→ 原文落藏书房 `_ai/library/raw/`、图片下到本地。**有没有你的一句说明**决定后面走哪条路：没说明 = 纯存档（机械 stub 页，不动 LLM）；有说明 = 深消化（说明进 source 页的 Why collected，含判断的同时进记忆区）。2026-09-02 定。

## 为什么能融合

`inbox/` 是**批量/外部输入的统一前门**（对话里的自动沉淀直接进记忆区，不经这里）。Web Clipper 剪藏落 `inbox/`，frontmatter 只带回溯字段（url/site/author 等，毛坯无契约）。出口不再等人到场：`ingest.js` 零 LLM 把 `source: web` 的毛坯搬进藏书房，删毛坯；手机手记（`source: obsidian`）仍留给会话开场分流。

```
网页 ──Web Clipper──▶ inbox/<时间>-<标题>.md  (source:web · url:… · note:… · ## 我 / ## 划线 / ## 正文)
                              │
                     ingest.js（06:00 自动 / 会话里随手；零 LLM）
                     · 图片 → _ai/library/assets/<raw 名>/，链接改本地，原 URL 留 title
                     · B 站无字幕 → yt-dlp 抽音频（vault 外 media）+ faster-whisper 转写回字幕段
                     · 说明/划线 → raw frontmatter；正文保持原文；按 url 查重
                              ▼
         无说明 ──▶ raw + 机械 stub source 页（depth: stub）        = 纯存档，说「消化 X」再深挖
         有说明 ──▶ raw，不写 source 页 → brief 报「待深消化」 ──▶ LLM 深消化页 + 说明含判断则进记忆区
```

设计取舍：**inbox = 毛坯，机械活交给脚本，思考只花在你标了态度的东西上**。所以默认不在剪藏时跑 LLM（Interpreter 可选，见 §5），避免双重花钱、保持"毛坯"语义。

---

## 1. 装扩展
浏览器商店搜 **Obsidian Web Clipper**（Chrome / Edge / Firefox / Safari 均有）安装。

## 2. 全局设置
扩展设置 → **General**：
- **Vault**：选你的库 `Obsidian Vault`。
- 其余默认即可（具体存放文件夹在模板里设，见下）。

## 3. 建模板「brain 毛坯」

**推荐走导入，别手抄**：扩展设置 → **Templates** → Import（导入），选 `_system/web-clipper-templates/brain-inbox.json`，一步到位。下面的逐项说明仅供核对/自定义。

> ⚠️ 手填的坑：本文表格里的 `\|` 是 **Markdown 表格转义**，实际填进扩展的是普通管道 `|`（如 `{{date|date:"YYYYMMDDTHHmm"}}`）。抄了 `\|` 会报一排 "Missing closing }}"。

扩展设置 → **Templates** → 新建，命名 `brain 毛坯`。逐项填：

| 字段                     | 填什么                                                   |
| ---------------------- | ----------------------------------------------------- |
| **Behavior（行为）**       | Create new note（创建新笔记）                                |
| **Note location（文件夹）** | `inbox`                                               |
| **Note name（笔记名）**     | `{{date\|date:"YYYYMMDDTHHmm"}}-{{title\|safe_name}}` |

> 笔记名 = brain 的 `<id>-<slug>` 约定：前半是当前时间紧凑串（与下面 frontmatter 的 `id` 一致），后半是安全化的标题。

**Properties（属性 = YAML frontmatter）** —— 逐行添加（左=键，右=值，注意「类型」列）：

| 键           | 值                                   | 属性类型 |
| ----------- | ----------------------------------- | ---- |
| `created`   | `{{date\|date:"YYYY-MM-DDTHH:mm"}}` | 文本   |
| `source`    | `web`                               | 文本   |
| `tags`      | （留空）                                | 列表   |
| `description` | `{{description}}`                 | 文本   |
| `url`       | `{{url}}`                           | 文本   |
| `site`      | `{{site}}`                          | 文本   |
| `author`    | `{{author}}`                        | 文本   |
| `published` | `{{published\|date:"YYYY-MM-DD"}}`  | 日期   |
| `note`      | （留空。有话就在弹窗里写一句：为什么收、哪里打动你、学到了什么）| 文本   |

> inbox 毛坯无契约（2026-08-26 重构后），这些全是**可回溯字段**（软 schema，缺了也无妨），让消化后的 AI 仓证据能引用原文。

**Note content（正文）**：
```
## 我


## 划线

{{highlights|map: item => item.text|list}}

## 正文

{{content}}
```
> 三段是给 `ingest.js` 认的：`## 我` 是你的说明（长的写这儿，一句话写 `note` 属性，两处都认）；`## 划线` 装 Web Clipper 高亮笔标的段落（`{{highlights}}` 变量，没划就是空）；`## 正文` 是文章本体。入库时说明与划线进 raw 的 frontmatter，正文原样落 raw。弹窗里属性和正文保存前都能改。

完成后：任意网页点扩展图标 → 选 `brain 毛坯` → 有话写 `note` 或 `## 我` → **Save**，就落进 `inbox/`。

## 4. 入库与消化（2026-09-02 起分两段）

**机械段（`ingest.js`，零 LLM）**：每日 06:00 `brain-daily` 自动跑；会话里 brief 报「剪藏 N 条未入库」时引擎跑 `brain ingest --no-asr`（几秒）。做的事见上面的图：落 raw、图片本地化、B 站无字幕转写、按 url 查重、删毛坯、git 提交。

**思考段（LLM，只花在有说明的）**：

| | 无说明 | 有说明（`note` 或 `## 我` 有字，或有划线） |
|---|---|---|
| 含义 | 纯存档，先留着 | 你在意：有想法、有一段打动你、学到了什么 |
| source 页 | 机械 stub（`depth: stub`），三行：是什么 / 为何收：无 / 出处 | LLM 深消化页（`depth: deep`），`Why collected` **原文引用你的话**，你划的段落优先展开 |
| 记忆区 | 不进 | 说明里含判断、教训、反应的 → 落 craft/ 或 journal，Relations 链回 source 页 |
| brief | 不报 | 报「藏书房待深消化 N 篇」，说「消化」就开工 |

- 想把某篇 stub 深挖：对话里说「消化 <标题>」，页面从 stub 升 deep
- **明显误剪（购物页、一次性查询）**：ingest 不判断，照样入库成 stub；你在 digest 里看到不想留的说一声删（删 raw + stub + assets 目录）

## 5.（可选）Interpreter：剪藏时就让 LLM 处理
默认**建议关掉**——保持 inbox 毛坯、思考交给消化环节，省一次 LLM 调用。若想剪藏当下就生成 TL;DR / 标签，可**复用你的 DeepSeek**（与 `brain-tools/.env` 的 `CHAT_API_KEY` 同一个 key）：

扩展设置 → **Interpreter** → 开启 → **Add provider**（自定义）：
- **Base URL**：`https://api.deepseek.com/chat/completions`（Interpreter 自定义 provider 用 chat completions 端点）
- **API key**：你的 DeepSeek key（同 `CHAT_API_KEY`）
- **Model**：`deepseek-v4-flash`（便宜快；⚠️ `deepseek-chat` 2026-07-24 弃用，别填）

然后在模板里用 **prompt 变量** `{{"……"}}`：
- 给 `tags`（列表类型）填值：`{{"给出 3 个中文主题标签，逗号分隔"|split:","}}`
- 正文加摘要：`> {{"用一句中文概括这篇文章"}}`

现成模板：导入 `_system/web-clipper-templates/brain-inbox-ai.json`（同毛坯契约，`description`/`tags` 改由 LLM 生成；**须先开 Interpreter**，否则用普通版）。

> ⚠️ Interpreter 每次剪藏多发一次 LLM 请求、产生 DeepSeek 费用；按需开。推荐用小模型。

## 6.（可选）按站点自动选模板
模板的 **Template triggers** 填触发规则，命中就自动套用该模板（第一个命中的生效）：
- **URL 前缀**：`https://news.ycombinator.com`
- **正则**（用 `/…/` 包裹、转义特殊字符）：`/^https:\/\/(www\.)?zhihu\.com\//`
- **schema.org 类型**：`schema:@Article`

可为论文站、知乎、HN 等建**不同模板**：都映射到 `inbox`，但用 `{{selector:…}}` / `{{schema:…}}` 抽各自结构化字段（如论文的作者/摘要、商品的价格）。

## 7. B站视频字幕：Bilibili Obsidian Clipper（专用旁路）

Web Clipper 抓不到 B站字幕，字幕走专用浏览器扩展 **Bilibili Obsidian Clipper**，经 Obsidian 插件 **Local REST API with MCP** 直写 vault。前门不变：照样落 `inbox/`，开场自检统一消化。

1. Obsidian 社区市场装 **Local REST API with MCP** 并启用；插件设置勾 **Enable Non-encrypted (HTTP) Server**（默认 `http://127.0.0.1:27123`，仅本机监听）；复制 API Key。
2. 浏览器扩展设置逐项：
   - **笔记目录**：`inbox`（统一前门，别用默认的 Clippings/Bilibili）
   - **Local REST API 地址 / Key**：填上一步的；先点「测试连接」
   - **默认标签**：留空或 `bilibili`（brain 里 tags 退居二线）
   - **下载格式**：SRT；**建议关掉「在字幕正文中保留时间戳」**——时间戳让毛坯 token 翻倍，回溯有 `url`/`bvid` 就够；确需跳转视频位置的再开
   - **笔记属性**：全勾（`bvid`/`cid`/`upload_date`/`subtitle_lang` 等是软 schema 可回溯字段，保留无妨）
   - **自定义属性**（可回溯标记）：`source`=`web` · `site`=`bilibili`。插件的自定义属性**不能留空值**，所以 `note` 属性要么不加（推荐，用下面的 `我` 段就够），要么填 `-` 占位（ingest 把 `-`/`无`/`none` 当没写）
   - **正文附加段落**：点「添加段落」，位置选「简介前」，段落标题填 `我`，**默认内容留空**（填了占位文字 ingest 会当成你的说明）。插件会在正文最前面插一个空的 `## 我` 段，看完视频有感悟就写在这儿（手机上也方便）。`note` 与 `## 我` 两处 ingest 都认
   - **导出前 20 条热门评论**：建议勾上，评论区常有纠错和补链接，只多几 KB
   - 插件自带的「AI 模型平台 / AI 对话」保持不配：剪藏时不跑 LLM 的原则不变
3. 注意：写入走本机 HTTP，**Obsidian 桌面端开着才能存**。
4. 入库同 §4：字幕全文进藏书房 `raw/`（`url`+`bvid` 随 frontmatter），无说明 stub、有说明深消化——字幕类来源易腐（下架/删稿），原文落地正是为它们。
5. **没字幕的视频**：剪藏照样落 inbox（简介、章节还在，字幕段空着）。`ingest.js` 看到字幕段为空就走兜底：`yt-dlp` 抽音频到 vault 外的 `{{MEDIA}}/<raw 名>/audio.m4a`，`faster-whisper`（CPU，medium 模型，venv 在 `~/.local/share/brain-asr`）转写回 `## 字幕`，首行标明 ASR 来源与日期，frontmatter `transcript: asr:medium`、`media:` 指向音频。会话里跑 `--no-asr` 时这类文件留在 inbox 等夜里（raw 落定后不可变，不能先落再补）。先看一眼插件能不能抓到 B 站站方的 AI 字幕，能抓就不用转写。

## 8. `ingest.js` 一览（机械入库）

| 事 | 怎么做 |
|---|---|
| 触发 | `brain daily` 06:00（ingest → harvest-sweep → lint → snapshot）；会话里 `brain ingest [--dry-run] [--no-asr] [--no-commit]` |
| 范围 | 只搬 `source: web`；手记留给会话分流 |
| 说明/划线 | `note` 属性 + `## 我` 段 → raw `note`；`## 划线` 段 + `==高亮==` → raw `highlights` |
| 图片 | 外链全部下到 `_ai/library/assets/<raw 名>/NN.ext`，markdown 链接改 `../assets/...`，原 URL 留图片 title；`<img>` 改 src 并留 `data-src`。失败保留外链，frontmatter `assets_failed` 计数，lint 点名，`--repair-assets` 重试。用 curl 下载（Node fetch 会被 Cloudflare 判成机器人拿 403）。**图片不进 git**（2026-09-03）：只在本机，`_system/vault.json` 填 `assetsBackup` 目录就每日 rsync 一份 |
| 音视频 | vault 外 `<vault 上级>/library-media/`（可用 `BRAIN_MEDIA_ROOT` 覆盖），不进 git、不进同步；`assetsBackup` 设了也一并 rsync |
| 查重 | 按 url（B 站去掉 `?vd_source=`）；重复且无说明 → 删毛坯；重复带说明 → 留 inbox 待人工 |
| 命名 | raw `YYYY-MM-DD-<标题 slug>.md`（保留中文）；stub `sources/<标题 slug>.md` |
| 删毛坯 | Obsidian 开着就 `obsidian delete path=inbox/…`（进 .trash，同步插件认账）；没开才 fs 删 |
| 提交 | 有变动就 `git commit`（`ingest: N clips → library …`） |

---

## 变量 / 过滤器 / 逻辑 速查（本接法用到的）
- **页面变量**：`{{title}}` `{{author}}` `{{content}}`（正文/选段/高亮，Markdown） `{{highlights}}`（高亮笔标的段落列表，`|map: item => item.text|list` 转成清单） `{{url}}` `{{domain}}` `{{site}}` `{{published}}` `{{date}}` `{{description}}` `{{selection}}`。
- **选择器**：`{{selector:css}}`（文本）· `{{selector:css?attr}}`（属性）· `{{selectorHtml:css|markdown}}`（HTML→MD）。
- **schema.org**：`{{schema:@Article:headline}}` · `{{schema:author}}`。
- **过滤器**（管道 `|` 串联）：`date:"YYYY-MM-DD"`（格式化日期）· `safe_name`（安全文件名）· `markdown`（HTML→MD）· `split:","` / `list`（转列表）· `blockquote`（加 `>`）· `slice` / `trim` / `lower`。
- **逻辑**：`{{a ?? b ?? "兜底"}}`（缺省回退）· `{% if author %}…{% endif %}`（条件）· `{% for x in schema:author %}…{% endfor %}`（循环）。

官方文档：[模板](https://obsidian.md/help/web-clipper/templates) · [变量](https://obsidian.md/help/web-clipper/variables) · [过滤器](https://obsidian.md/help/web-clipper/filters) · [逻辑](https://obsidian.md/help/web-clipper/logic) · [Interpreter](https://obsidian.md/help/web-clipper/interpreter)
