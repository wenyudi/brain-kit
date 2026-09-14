# brain-kit 全局（所有目录生效；库级 AGENTS.md 更细）

- 记忆在这几处：{{VAULTS}}。按 cwd 定库，basic-memory MCP 写入显式带 `project`。
- 答问题先查记忆：涉及本人环境、过去的决定、踩过的坑，先用 basic-memory 的 `search_notes`，答案带依据。
- 问「现在是否仍然成立」或新旧冲突时，优先 `brain memory recall "问题"`（自动按 cwd 定库；跨库显式 `--vault`），读取证据日期与替换关系；直接 MCP 搜索不会执行这层校验。新模型、沉淀日期、文件修改日期都不等于重新验证。新模型复核入口 `brain memory queue --model <运行时模型ID>`，只生成待复核列表，不自动淘汰旧事实。
- 会话夜里会被自动捞进记忆区；用户说「沉淀」就把本场的亲历/决定/教训用英文写进对应库的 `_ai/memory/`（craft/ 一课一页，journal/<日期>.md 记事件），落完 git 提交。`brain which` 告诉你当前 cwd 归哪个库。
- 密钥/凭据永不入仓、不进上下文。
