---
name: harvest
description: 沉淀——把当前(或指定历史)会话里值得留的事蒸进记忆仓;落点由注册表按 cwd 定(`brain which`)。Use when 用户说「沉淀」「harvest」,或点名要蒸某场历史会话(claude/codex 的 jsonl)。在任何项目目录都可用。
---

# harvest — 会话里值得留的事写进记忆仓

用户说「沉淀」才做。只留以后可能再用到的东西；用户的原话和决定优先；自己推断出来的规律只写成提议，等用户拍板（2026-10-25 起：AI 不立规矩，记忆不当法律）。

## 落点按注册表定(`brain which [cwd]` 一句话给答案)

- cwd 落在某库 `include` 前缀下就归它,否则归默认库(注册表 `~/.config/brain/vaults.json`);记忆区 = `<库路径>/_ai/memory/`(规约见其 README)
- 跨库红线看各库 CLAUDE.md「本库专属」与各区 CLAUDE.md(如工作/个人脱钩:工作内容即使在个人目录聊到也落工作库;客户敏感数据存指针不存内容)
- 人读层(vault 顶层)**不动**:harvest 只写 `_ai/memory/`;常青页(pages/)与周 digest 走各自流程
- 语言跟着内容走;专有名词、命令、原话保留原样

## 蒸什么、落到哪

- **用户明确说的偏好或决定** → 原话 + 日期 + 适用范围,进 `_ai/memory/preferences.md`(工作流程类;审美、方向这类每单重新判断的不进)或该项目的工作备注
- **事件和决定** → 追加 `journal/<YYYY-MM-DD>.md`(记到事件级,不记键击级流水)
- **可复用的经验** → 写到用它的地方:属于某个工具或流程的,提议改那个 skill 的参考资料(用户同意再改);属于环境的进清单页;其余进 `craft/` 的主题页(同主题已有就更新它,先 `brain find` 查重;不必一课一页)
- **自己推断的规律** → journal 里一行「现象 + 提议」,不升格成规则
- **工具 bug** → 指出来;用户在场且同意就直接修代码,修好这条就不必写成经验
- **冒出的待办** → `tasks/<标题>.md`(`due: YYYY-MM-DD` + `status: open`)
- 不记:密钥/凭据/token(红线;protect-secrets 拦的是读,写入全靠这条)、与本人环境无关的公共知识(公共资料去藏书房)

## 怎么写才不容易过时

- 按「谁能让它失效」决定写法:我们自己的代码 → 修代码;供应商、工具的行为 → 一句带日期的话(写清是哪个供应商、哪天观察到);模型能力 → 便宜的预防照写,贵的补救写成「先检查 X,不过再做 Y」;环境现状 → 清单页上带日期的事实;模型路由判断(哪个模型做什么更好)→ 只留 journal
- 状态型事实写观察日期;日期和观察来源写在句子里,不加 frontmatter 字段
- 新证据推翻旧条目就改旧条目,旧说法连同日期移进 journal;两条在不同条件下都成立就写清条件
- frontmatter 只要 `title` / `type` / `tags` / `created`;正文自包含——关键依据带在身上,会话原文回读贵

## 落完必做:git 提交

```bash
# 落点库根下当场提交(别赌 hook);该库 vault.json 的 checkpoint.push 开着(如工作库,livesync 在跑)就再 git push
cd "<brain which 给的库路径>" && git add -A && git commit -m "harvest: <一句话概括>"
```

## 提名检查(顺手做)

这次蒸的东西让某主题攒到约 3 条同型经验、或一件事收尾了 → 对话里提一句「这个够写一篇常青页了,要吗」。**用户点头才动笔**,落 vault `pages/`,文风按 vault `_system/人话规范.md`。

## 历史会话怎么捞(用户点名才捞,不批量回扫)

- 有编号的:`brain sessions list` 看编号对应路径 → `brain sessions condense #n > /tmp/h.md` 读浓缩稿 → 落盘提交 → `brain sessions mark #n manual` 登记。浓缩稿把工具输入截到 200 字、输出截到 300 字、超长会话丢中段:关键证据(报错原文、命令、数字)回原始 jsonl 按关键词定位核对,别凭浓缩稿下结论
- Claude 会话:`~/.claude/projects/<项目slug>/*.jsonl`(slug=物理路径连字符化,个人 vault 现为 `-mnt-workspace-Raul-Obsidian-Vault`;2026-08-28 搬家前的会话在旧 slug `-home-raul-Documents-Obsidian-Vault`);按用户给的话题/时间,先 `ls -t` 锁定候选,再 Grep 关键词定位,只读命中段落附近,不通读全文件
- Codex 会话:`~/.codex/sessions/<年>/…`(jsonl 同理)
- 22G 历史永不全量扫;一次最多捞用户点名的 1–3 场。夜间自动捞已于 2026-10-25 停用

## 汇报

每条落盘物一行:`↳ journal/xxx.md`、`↳ preferences.md`……没有够格的就直说"这场没有值得沉的",不硬蒸。
