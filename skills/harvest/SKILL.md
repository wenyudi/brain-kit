---
name: harvest
description: 沉淀——把当前(或指定历史)会话里的洞察/决定/经验蒸馏进记忆仓,英文写;落点按分区:工作区(~/Workspace/Work)落 work 仓,其余落个人 brain 仓(~/Workspace/Raul/Obsidian Vault/_ai/memory)。Use when 用户说「沉淀」「harvest」,或点名要蒸某场历史会话(claude/codex 的 jsonl)。在任何项目目录都可用。
---

# harvest — 会话蒸馏进 AI 仓

把对话里值钱的东西蒸出来,落进 AI 仓。**准入黑名单制(2026-09-01 起):默认记录、宁多勿缺——拿不准就落,噪音由检索排序兜底。**

## 落点按分区定(先看 cwd,唯一的分叉;拿不准就 `brain which`)

- **cwd 在工作区**(`/mnt/workspace/Work/` 或 `~/Workspace/Work/` 前缀,含符号链接形态)→ 落 **work 记忆区** `~/Workspace/Work/Work Vault/_ai/memory/`(basic-memory 项目 `work`,规约见其 README;2026-08-28 工作侧同样全合一,旧独立仓 work-memory 已归档;红线加一条:客户敏感数据存指针不存内容)。落完在 Work Vault 当场 `git add -A && git commit && git push`
- **其余任何目录** → 落个人 **brain 仓** `~/Workspace/Raul/Obsidian Vault/_ai/memory/`(basic-memory 项目 `brain`,规约见其 README;2026-08-28 全合一起记忆区就在 vault 里,vault 同日从 ~/Documents 迁至 ~/Workspace/Raul)。工作内容即使在个人目录聊到,也改落 work 仓——工作/个人脱钩(2026-08-20)
- **一律用英文写**(2026-08-27 定):标题/文件名/正文/Observations;证据原文引用与专有名词保留原语言
- 人读层(vault 顶层)**不动**:harvest 只写 `_ai/memory/`;常青页(pages/)与周 digest 走各自流程(用户点头/周报节奏)

## 蒸什么(准入黑名单制,2026-09-01 白名单翻黑名单)

**默认记录**:亲历/踩坑/决定及理由、尝试过但没成的路、推翻的旧认识、跑通的可复用做法、环境事实、用户偏好、待验证猜测(标明是猜测)。拿不准就落——写入时预判"将来有没有用"不可靠,细节丢了不可恢复。
**只排除三类**:①与本人环境零绑定的纯公共知识(概念/工具通用用法——检索噪音唯一来源)②凭据/密钥/token 绝不入仓(work 仓没有 protect-secrets 护栏;brain 侧虽有护栏兜底,也一样不写;work 侧客户敏感内容存指针不存内容)③键击级流水(改了哪些文件、跑了什么命令的逐条过程不蒸;journal 记到事件级)。
状态型事实带日期;同主题旧稿被推翻就 edit 修正,别留误导版本。

## 落到哪(路径都在落点仓根下;brain 仓根=vault 的 `_ai/memory/`)

- 经验教训 → `craft/<标题>.md`——**每条可复用的教训都单独一页**(2026-09-02 立规:journal 里的 `[lesson]` 只是原料不是终点;brief/lint 有 lesson 对 craft 的缺口哨兵;`type: craft`)(标题即文件名;frontmatter `title`/`type: note`/`tags`/`created`;正文**自包含**——关键对答/依据带在身上,会话原文回读贵,末尾一行会话指针 `> 源会话:<jsonl 路径或"本场">·<日期>`;末尾 `## Observations`(`- [category] 事实 #tag`)和 `## Relations`(`- 动词 [[目标标题]]`)喂知识图谱)
- 事件/决定流水 → 追加 `journal/<YYYY-MM-DD>.md`
- 冒出的待办 → `tasks/<标题>.md`(`due: YYYY-MM-DD` + `status: open`)
- **同主题已有文件就更新它**,别另起新篇(先 Grep 落点仓查重);但单页过 ~150 行就按子题拆、用 Relations 连边(2026-09-01 反巨页;journal 按日豁免)

## 落完必做:git 提交

```bash
# brain 侧:vault 单仓,当场提交(别赌 hook)
cd "$HOME/Workspace/Raul/Obsidian Vault" && git add -A && git commit -m "harvest: <一句话概括>"
# work 侧:提交后还要推(该仓无定时快照兜底)
cd "$HOME/Workspace/Work/Work Vault" && git add -A && git commit -m "harvest: <一句话概括>" && git push
```

## 提名检查(顺手做)

这次蒸的东西让某主题攒到约 3 条同型经验、或一件事收尾了 → 对话里提一句「这个够写一篇常青页了,要吗」。**用户点头才动笔**,落 vault `pages/`,文风按 vault `_system/人话规范.md`。

## 未捞会话(2026-09-02 机制:brief 报、夜里自动捞、白天点名捞)

- 个人 vault 的 brief 会报「未捞会话 N 场」(最近 7 天、用户轮次 ≥6、没写过记忆区、没登记过;工作区路径已排除,`_system/vault.json` 的 `harvest.include/exclude` 可调)。夜里 `brain-daily` 的 `harvest-sweep.js` 每晚自动捞 ≤3 场,craft/tasks 产物 frontmatter 带 `provenance: auto-harvest` + `session:`,journal 条目带 `auto-harvest:` 前缀。
- 用户说「捞 #n」:
  1. `brain sessions list` 看编号对应的路径（`brain which` 告诉你当前 cwd 归哪个库；`--vault <路径>` 指定库）
  2. `brain sessions condense #n > /tmp/h.md` 拿浓缩稿(只留人话+助手正文+工具名,比读原始 jsonl 便宜一个量级),Read 它,不通读 jsonl
  3. 照上面的规矩落盘、提交
  4. `brain sessions mark #n manual` 登记,brief 就不再报它
- 哪个 cwd 归哪个库由注册表 `~/.config/brain/vaults.json` 定(2026-09-03 brain-kit):`brain which <cwd>` 输出库路径与 basic-memory 项目名

## 历史会话怎么捞(用户点名才捞,不批量回扫)

- Claude 会话:`~/.claude/projects/<项目slug>/*.jsonl`(slug=物理路径连字符化,个人 vault 现为 `-mnt-workspace-Raul-Obsidian-Vault`;2026-08-28 搬家前的会话在旧 slug `-home-raul-Documents-Obsidian-Vault`);按用户给的话题/时间,先 `ls -t` 锁定候选,再 Grep 关键词定位,只读命中段落附近,不通读全文件
- Codex 会话:`~/.codex/sessions/<年>/…`(jsonl 同理)
- 22G 历史永不全量扫;一次最多捞用户点名的 1–3 场

## 汇报

每条落盘物一行:`↳ craft/xxx.md`。没有够格的就直说"这场没有值得沉的",不硬蒸。
