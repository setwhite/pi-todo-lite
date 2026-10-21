# DECISIONS · pi-todo-lite

> 每条说清「定成什么、为什么、代价」。要推翻哪条，先看这里的理由 —— 推翻要连带改 `docs/SPEC.md`。

## 1 · 单工具整表快照，不用 action + id

**决定**：工具只有 `todo(tasks)`，整表替换；没有 id、key、action、baseVersion。

**为什么**：头号失败模式是「陈旧计划」，根因是更新一次要付一次完整往返 —— 动作式协议里「完成一件 + 开工一件」是两次调用。整表把它压成一次，顺带消掉两类错误：没有 id 就没有删后漂移，没有 key 就不必在 prompt 里教模型起名。代价是每次重发任务文本（20 项约多 200 输出 token），只在调用时付。

**后果**：进度只靠 `status` 三态表达；删 = 不出现在表里。上限由报错消息带出，不写进模型侧文案 —— 它是探针、不是教学。

## 2 · 状态只写自己的账，不写 toolResult details

**决定**：每次变化 `pi.appendEntry("pi-todo-state", { tasks })`；回放只扫 `type: "custom"` + `customType: "pi-todo-state"` 的条目，不读 toolResult 的 `details`。

**为什么**：本机是 `codemode.mode: "only"` —— 模型写脚本调 `tools.todo()`，而嵌套调用**不写 transcript 条目**，流水账里根本没有那条 toolResult，只靠 details 回放会丢状态。只有一条写入路径加一个读取路径，就不存在两边不一致；写进会话文件后分支天然正确、抗 compaction。

**后果**：每次变化多一条会话条目；`/todos` 的输出与工具返回值都不落账。`replayTasks` 遇坏快照整条跳过、继续往前扫 —— 宁可退回旧快照，也不修补残表。

## 3 · 不做 nudge（收尾提醒）

**决定**：不在 `agent_settled` 时往 systemPrompt 塞「还有未完成项」的提醒。替代是模型侧 guideline（默认：短句、3+ 步；`model` 档再加「干完发空表能清」），不额外加提醒。

**为什么**：① 中途改 systemPrompt 前缀会打掉 provider 的缓存前缀，走完整 transcript checkpoint；② 提醒的方向是「让表看起来干净」，模型被催时最省力的路径是把没验完的标成 completed —— 一张过于乐观的表比陈旧更坏，陈旧至少还把 `in_progress` 摆在那儿。

**后果**：自动清空不监听 `agent_settled`，也不碰 prompt；`agent_settled` 与本扩展无关（见第 6 条）。

## 4 · 配置：只读、坏配置抛错、越界 clamp

**决定**：文件不存在 = 全默认值，不报错；扩展只读不写、不替你生成配置。JSON 坏 / 未知键 / 类型或枚举错 = 抛 `Error`，消息带绝对路径与逐条 `字段路径: 原因`。数值越界 = clamp。

**为什么**：自己写的文件写坏了要立刻看见；而「行数给多了」不是错误，夹到上限即可。类型错与越界区别对待：前者是笔误，后者是分寸。

**后果**：报错消息是给人看的界面 —— 值回显有界（超 32 字符截断、容器只说形状），不把任务正文灌进消息。加一个键要同时动类型、默认值、校验、README 的示例四处，缺一处算没做完（`test/docs.test.ts` 会抓）。判据只有一条：**你真的会为了它去开一下 config.json 吗** —— 不会的键就别加。

## 5 · 自动清空：清显示要连账一起清（触发点与默认档见第 6 条）

**决定**：`lifecycle.onFinish` 三档 `model` / `keep` / `clear`，不设只收起 widget 的 `fade`。`clear` 写一条 `{tasks: []}` 快照，与 `/todos clear` 共用同一条写入路径；自动触发只在整表 `completed` 时发生，未完成的计划永不被自动清掉。

**为什么**：① 只清显示兜不住 —— `session_start` / `compact` / `tree` 回放会把旧表捞回来，账与视图两边不一致，所以清就得连账一起清；② `fade` 与按一下 `alt+t` 的屏幕结果一模一样，模型下一轮重发整表又把 widget 顶回来，省一次按键不值一档；③ 保留 `model` 档 —— 让模型自己在最后一次调用传空表，是它知道表清了的唯一路径。

**后果**：收起 widget 只剩 `alt+t` 一个入口。清空后模型上下文里那张表还在，它下一轮若重发整表，表会回来（协议是整表覆盖）；要让它也知道得上 nudge / steer（第 3 条明确不做）。

## 6 · clear 在用户发下一条消息时触发，并成为默认档

**决定**：`lifecycle.onFinish: "clear"` 挂在 `input`（source 不筛：interactive / rpc / extension 一样），守卫是表非空且整表 `completed`；默认值由 `model` 改成 `clear`。

**为什么**：① `agent_settled` 一到就清，是在用户眼皮底下把表抽走 —— 他多半还没看完，表越长越糟；挪到「用户发下一条消息」，看完是有保证的，下一轮又是干净的一张纸。② 挂 `input` 而不是 `before_agent_start`：`input` 就是「用户发消息」本身，三种跑法（TUI / RPC / 其他扩展注入）同一个入口。③ 默认换成 `clear`：多数时候只想让它干完就消失，不必赌模型记得发 `tasks: []`；`model` 档仍留在配置里。④ 代价：默认档不再注册「干完发 `tasks: []`」那条 guideline（会自己清的档告诉模型只会拆台），模型侧文案从 141 字符缩到 80。

**后果**：`clear` 档下那张完成的表会一直停在屏幕上，直到用户敲下一条消息；想立刻收起还是 `alt+t`。`agent_settled` 与本扩展无关。
