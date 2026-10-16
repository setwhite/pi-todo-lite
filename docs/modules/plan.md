# plan.ts

计划语义：类型、校验、回放、给模型看的文本。不 import 任何东西。

## 契约

```ts
export type Status = "pending" | "in_progress" | "completed";
export type Task = { content: string; status: Status };

export function validateTasks(
  input: unknown,
  limits: { maxTasks: number; maxContentChars: number },
): Task[];
export function replayTasks(entries: readonly unknown[]): Task[];
export function formatTasks(tasks: readonly Task[]): string;
```

- `validateTasks`：**全有或全无**。content 先 trim；空、超长，status 不在三态里，项数超限，`tasks` 不是数组 —— 任一条不合规就抛 `Error`，消息一次列完全部违规，每条形如 `todo: task 3: content is 128 chars, max is 120`。返回 trim 过的新数组，不改入参。
- `replayTasks`：取最后一条 `type: "custom"` 且 `customType: "pi-todo-state"` 的条目，读它的 `data.tasks`；坏条目跳过继续往前扫；一条都没有 → `[]`。**不读 toolResult 的 details**（状态只写一条账）。
- `formatTasks`：工具返回的那段文本。空表 → `Todo 0/0`；否则一行进度 + 每项一行，前缀 `[ ]` / `[-]` / `[x]`。

## 取舍

- 不加 `deleted` 状态、不加 id、不加 `activeForm`：删就是不出现在表里。
- 校验不返回错误数组，直接抛：调用方没有「部分成功」这条路。
