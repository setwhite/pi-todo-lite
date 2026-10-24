# D03 · 不做 nudge（收尾提醒）

**决定**：不在 `agent_settled` 时往 systemPrompt 塞「还有未完成项」的提醒。替代是模型侧 guideline（默认：短句、3+ 步；`model` 档再加「干完发空表能清」），不额外加提醒。

**为什么**：① 中途改 systemPrompt 前缀会打掉 provider 的缓存前缀，走完整 transcript checkpoint；② 提醒的方向是「让表看起来干净」，模型被催时最省力的路径是把没验完的标成 completed —— 一张过于乐观的表比陈旧更坏，陈旧至少还把 `in_progress` 摆在那儿。

**后果**：自动清空不监听 `agent_settled`，也不碰 prompt；`agent_settled` 与本扩展无关（见 [`D06`](D06-clear-on-input.md)）。
