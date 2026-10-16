# plan.ts

计划语义：类型、校验、回放、给模型看的文本。不 import 任何东西。

## 契约

```ts
export type Status = "pending" | "in_progress" | "completed";
export type Task = { content: string; status: Status };

export type ValidateOptions = {
  toolName: string;      // 每条错误消息的开头
  maxTasks: number;
  maxContentChars: number;
};

export function validateTasks(input: unknown, options: ValidateOptions): Task[];
export function replayTasks(entries: readonly unknown[]): Task[];
export function formatTasks(tasks: readonly Task[]): string;
```

- `validateTasks`：**全有或全无**。content 先 trim；空、超长，status 不在三态里，项数超限，未知键，`tasks` 不是数组 —— 任一条不合规就抛 `Error`，返回 trim 过的新数组、不改入参。
  - 消息一次列完全部违规（`\n` 连接），**每一行**都以 `<toolName>: ` 开头，顺序固定：顶层未知键 → `tasks` 形状/项数 → 按项序（一项内先 content 后 status 再未知键）。`tasks` 不是数组也并进这份列表，不单行早退 —— `{tasks: 3, action: "add"}` 一次报两条。
  - 逐项的原因：`task 3: content is 128 chars, max is 120` / `task 1: content is empty` / `task 2: expected string, got 5` / `task 4: expected object, got "do it"` / `task 1: expected one of pending | in_progress | completed, got "done"` / `task 1: unknown key "id"`；整表的原因：`unknown key "action"` / `tasks has 21 items, max is 20` / `tasks: expected array, got 3` / `expected object, got null`。
  - 长度按 **Unicode code point** 计（`Array.from(content).length`，emoji 算 1 个），上限取 `options` 不硬编码。
  - 报错只给类型、长度与上限，不回显正文：字符串超过 32 字符就截断（`"zzz…"`），容器只说形状（`array of 21`、`object with keys a, b`）；截断按 code point 切，不切出半个代理对。
  - 未知键在任意层级都拒绝、不静默剥离：rpiv 那套 `action` / `id` / `activeForm` 混进来会被点名。T6 注册的 schema 也应为 `additionalProperties: false`，让模型更早看到同一件事。
- `replayTasks`：取最后一条 `type: "custom"` 且 `customType: "pi-todo-state"` 的条目，读它的 `data.tasks`；坏条目跳过继续往前扫；一条都没有 → `[]`。**不读 toolResult 的 details**（状态只写一条账）。
- `formatTasks`：工具返回的那段文本。空表 → `Todo 0/0`；否则一行进度 + 每项一行，前缀 `[ ]` / `[-]` / `[x]`。

## 取舍

- 不加 `deleted` 状态、不加 id、不加 `activeForm`：删就是不出现在表里。
- 校验不返回错误数组，直接抛：调用方没有「部分成功」这条路。
