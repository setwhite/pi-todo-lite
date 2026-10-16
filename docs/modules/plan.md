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
  - content 必须是**纯文本、单行**：命中控制字符 / 行分隔符（`\p{Cc}`、`\p{Zl}`、`\p{Zp}`：`\n` / `\t` / ESC …）报 `… has a control character (U+000A); keep it one line`，命中不可见格式字符（`\p{Cf}`：RLO / ZWSP / 软连字符 / BOM / ZWJ …）报 `… has an invisible character (U+202E); keep it plain text`，命中字符都带 U+ 码点与名字。**不做白名单**：ZWJ 组字 emoji（`👨‍👩‍👧`）也被拒，单码点 emoji（`😀`）本就不含 `\p{Cf}`，不受影响。同一项里控制字符与超长同时踩中，两条都报 —— 「一次列完」包含同一字段的多个问题。
- `replayTasks`：从后往前取**最后一条有效**快照（`type: "custom"` + `customType: "pi-todo-state"` 的 `data.tasks`），坏条目跳过继续往前扫，一条都没有 → `[]`。**不读 toolResult 的 details**（状态只写一条账）。
  - 什么算坏：不是我们的条目、`data` 不是对象、`data.tasks` 不是数组、项不是对象、content trim 后为空、status 不在三态 —— 整条快照作废，不修补、不部分采用。
  - 回放出来的项只留 `content`（trim 过，与校验后的不变式一致）与 `status`，多余字段丢掉；不设条数与长度上限（快照是当时校验过的，改过配置的老会话照样回放）。
  - 快照里的**转义序列整条丢掉**（CSI `ESC [ 31m`、OSC `ESC ] 8;;url BEL`、单字符 Fe），其余控制字符与不可见格式字符**压成一个空格**再 trim：老账本里留了个换行或 ANSI 不该让整张表消失、也不该留下 `[31m` 这种残渣（清完为空的项仍算坏快照）。
- `formatTasks`：工具返回的那段文本。空表 → `Todo 0/0`；否则一行进度 `Todo {done}/{total}`（有 in_progress 才补 `· {doing} doing`）+ 每项一行 `[ ]` / `[-]` / `[x]` + 空格 + content，`\n` 连接、无尾换行。进度行的规则与 widget 表头同一套，但 `view.ts` 按契约自己实现模板。

## 取舍

- 不加 `deleted` 状态、不加 id、不加 `activeForm`：删就是不出现在表里。
- 校验不返回错误数组，直接抛：调用方没有「部分成功」这条路。
- 两侧口子宽严不同：`validateTasks` 是模型输入的口，严 —— 一次列全违规、控制字符直接退回让模型重写；`replayTasks` 是自己账本的口，宽 —— 坏快照整条跳过、控制字符压平，往前的旧快照比残表更可信。
- 「`Task.content` 单行、无控制字符与不可见字符、trim 过」这条不变量由本模块保证，所以 `formatTasks` 与 widget 都不用再自己清终端控制字符、也不用防一项变多行（对照 rpiv 在工具边界另做 `sanitize`）。
