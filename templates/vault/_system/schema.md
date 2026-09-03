# 人读层契约（散文版）

2026-08-28 全合一后，vault 顶层是人读层；`_ai/` 是 AI 区（记忆 `_ai/memory` = basic-memory 项目 `brain`，藏书房 `_ai/library` = 项目 `library`），格式归各自的 README 管，这里不管。

## 层与字段

**pages/ 常青页**——要用才查的知识页，同主题只有一页，新经验来了更新原页。
```yaml
type: page
updated: 2026-08-26   # 每次实质更新必刷
status: draft         # 可选：AI 默认写的草稿，用户否决就删、点头就去掉这行（2026-09-02）
```
正文体例：先结论后展开；事实要么永恒、要么带日期、要么是指针（freshness 刀，lint 每日查 90 天未刷的页）。

**digest/ 周报**——每周第一场会话把上周 AI 仓新增蒸成一篇，文件名 `<年>-W<周>.md`（如 `2026-W35.md`）。
```yaml
type: digest
date: 2026-08-26   # 生成日
```

**inbox/**——采集毛坯，自由格式，不留存量。剪藏（`source: web`）由 `brain ingest` 机械搬进藏书房（每日 06:00 或会话里随手跑）；手记开场分流后删除。

**速查目录**（{{HUMAN_DIRS}} 里的工具书目录）——要用才查的工具书；凭据永远在库外，页面里禁写明文。

**navigation/**——域索引页，纯指针。

## 文风

人读层一切产出（pages/digest/速查/HOME）遵守 `_system/人话规范.md`，写完自查一遍再落盘。

## 机器校验

- 写时：brain-kit `lib/check.js`（PostToolUse hook）拦必填字段、type、日期格式、digest 命名；写进退役目录（notes/entities/log/tasks/questions/outputs）直接拒——那些去 AI 仓
- 每日：`brain lint` 全量体检（契约、死链、常青页保鲜、AI 仓基本盘）
- 规则单源在 brain-kit `lib/lib.js` 的 CONTRACT，改契约只改那里（这页是散文版说明）
