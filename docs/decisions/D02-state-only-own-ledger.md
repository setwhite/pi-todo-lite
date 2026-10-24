# D02 · 状态只写自己的账，不写 toolResult details

**决定**：每次变化 `pi.appendEntry("pi-todo-state", { tasks })`；回放只扫 `type: "custom"` + `customType: "pi-todo-state"` 的条目，不读 toolResult 的 `details`。

**为什么**：本机是 `codemode.mode: "only"` —— 模型写脚本调 `tools.todo()`，而嵌套调用**不写 transcript 条目**，流水账里根本没有那条 toolResult，只靠 details 回放会丢状态。只有一条写入路径加一个读取路径，就不存在两边不一致；写进会话文件后分支天然正确、抗 compaction。

**后果**：每次变化多一条会话条目；`/todos` 的输出与工具返回值都不落账。`replayTasks` 遇坏快照整条跳过、继续往前扫 —— 宁可退回旧快照，也不修补残表。
