# brain-kit 全局（所有目录生效；库级 CLAUDE.md 更细）

- **记忆在这几处**：{{VAULTS}}。按 cwd 定库，MCP 写入显式带 `project`，别串仓。
- **答问题先查记忆**：涉及本人环境、过去的决定、踩过的坑，先 basic-memory `search_notes`（没 MCP 就 Grep 该库 `_ai/memory/`），答案带依据；不做无源断言。
- 问「现在是否仍然成立」或新旧冲突时，优先 `brain memory recall "问题"`（按 cwd 定库；跨库显式 `--vault`），读取证据日期与替换关系；直接 MCP 搜索不会执行这层校验。新模型、沉淀日期和文件修改日期不等于重新验证。`brain memory queue --model <运行时模型ID>` 只安排复核，不自动淘汰旧事实。
- **沉淀不靠人记**：vault 外的会话夜里由 `brain daily` 自动捞进记忆区（`provenance: auto-harvest`）；用户说「沉淀」= /harvest 当场蒸；`brain which` 告诉你当前 cwd 归哪个库。
- 密钥/凭据永不入仓、不进上下文。机制入口 `brain`（{{KIT}}）。
