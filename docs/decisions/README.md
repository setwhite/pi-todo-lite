# 决策记录 · pi-todo-lite

每条说清「定成什么、为什么、代价」。要推翻哪条，先看这里的理由 —— 推翻要连带改 `docs/specs/0001-pi-todo-lite.md`。

| 编号 | 决策 |
|---|---|
| [`D01`](D01-whole-table-snapshot.md) | 单工具整表快照，不用 action + id |
| [`D02`](D02-state-only-own-ledger.md) | 状态只写自己的账，不写 toolResult details |
| [`D03`](D03-no-nudge.md) | 不做 nudge（收尾提醒） |
| [`D04`](D04-config-read-only.md) | 配置：只读、坏配置抛错、越界 clamp |
| [`D05`](D05-auto-clear-clears-ledger.md) | 自动清空：清显示要连账一起清 |
| [`D06`](D06-clear-on-input.md) | clear 在用户发下一条消息时触发，并成为默认档 |

一条一份文件。任务与阶段见 [`docs/todos/`](../todos/README.md)，契约见 [`docs/specs/`](../specs/0001-pi-todo-lite.md)。
