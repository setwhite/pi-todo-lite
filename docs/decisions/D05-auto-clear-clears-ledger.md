# D05 · 自动清空：清显示要连账一起清

**决定**：`lifecycle.onFinish` 三档 `model` / `keep` / `clear`，不设只收起 widget 的 `fade`。`clear` 写一条 `{tasks: []}` 快照，与 `/todos clear` 共用同一条写入路径；自动触发只在整表 `completed` 时发生，未完成的计划永不被自动清掉。触发点与默认档见 [`D06`](D06-clear-on-input.md)。

**为什么**：① 只清显示兜不住 —— `session_start` / `compact` / `tree` 回放会把旧表捞回来，账与视图两边不一致，所以清就得连账一起清；② `fade` 与按一下 `alt+t` 的屏幕结果一模一样，模型下一轮重发整表又把 widget 顶回来，省一次按键不值一档；③ 保留 `model` 档 —— 让模型自己在最后一次调用传空表，是它知道表清了的唯一路径。

**后果**：收起 widget 只剩 `alt+t` 一个入口。清空后模型上下文里那张表还在，它下一轮若重发整表，表会回来（协议是整表覆盖）；要让它也知道得上 nudge / steer（见 [`D03`](D03-no-nudge.md)）。
