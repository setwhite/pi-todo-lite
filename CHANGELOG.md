# CHANGELOG

已发布版本的用户可见变更；更细的过程见 git log。破坏性变更在条目里标注 **BREAKING**。

## 0.1.4 — 2026-10-25

- 无运行时变更：文档重组（spec 瘦身为契约、决策拆成单文件、新增 ARCHITECTURE 与 GLOSSARY）、README 中英两版按 ASD-STE10 重写、代码注释精简

## 0.1.3 — 2026-10-22

- 无运行时变更（与 0.1.2 相同）：仓库加了发布物与依赖方向的执行器、提交前闸，CI 与发布流水线加固（action 按 commit SHA 固定、lint 挡 warning、publish 前对真实 tarball 断言、每日依赖审计）

## 0.1.2 — 2026-10-21

- 无功能变更；重新发布以触发 npm 搜索索引重建（0.1.1 未被 `/-/v1/search` 索引，pi.dev 列表未收录）

## 0.1.1 — 2026-10-18

- **行为变更**：自动清空从「模型这波活干完（`agent_settled`）」挪到「用户发下一条消息（`input`）」；`lifecycle.onFinish` 的默认档由 `model` 改成 `clear`。已完成的表会留到用户发下一条消息，想立刻收起按 `alt+t`；要恢复旧行为写 `"onFinish": "model"`
- `clear` 档下不再注册「干完发 `tasks: []` 能清空」的 guideline，模型侧文案由 141 字符缩到 80
- 文档：npm 安装去掉「暂不可用」标记

## 0.1.0 — 2026-10-18

- 首个发布
- 工具 `todo(tasks)`：一次调用提交完整有序表、整表替换，`tasks: []` 表示清空；没有 id / key / action / baseVersion
- 输入框上方常驻任务表：默认最多 9 行，溢出先丢已完成的；`alt+t` 折叠，任务表不动
- compaction、切分支、`--continue` 之后自动回放；状态只写 `pi-todo-state` 快照这一条账
- `/todos` 全列清单，`/todos clear` 清空，`/todos export` 导出 markdown，`/todos import <file>` 读回
- 配置 `<agent dir>/pi-todo/config.json`：扩展只读；JSON 坏 / 未知键 / 类型或枚举错抛错并带字段路径，数值越界 clamp
- `lifecycle.onFinish` 三档：`model`（默认）/ `keep` / `clear`
- 零运行时依赖
