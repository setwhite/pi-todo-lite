# D06 · clear 在用户发下一条消息时触发，并成为默认档

**决定**：`lifecycle.onFinish: "clear"` 挂在 `input`（source 不筛：interactive / rpc / extension 一样），守卫是表非空且整表 `completed`；默认值由 `model` 改成 `clear`。

**为什么**：① `agent_settled` 一到就清，是在用户眼皮底下把表抽走 —— 他多半还没看完，表越长越糟；挪到「用户发下一条消息」，看完是有保证的，下一轮又是干净的一张纸。② 挂 `input` 而不是 `before_agent_start`：`input` 就是「用户发消息」本身，三种跑法（TUI / RPC / 其他扩展注入）同一个入口。③ 默认换成 `clear`：多数时候只想让它干完就消失，不必赌模型记得发 `tasks: []`；`model` 档仍留在配置里。④ 代价：默认档不再注册「干完发 `tasks: []`」那条 guideline（会自己清的档告诉模型只会拆台），模型侧文案从 141 字符缩到 80。

**后果**：`clear` 档下那张完成的表会一直停在屏幕上，直到用户敲下一条消息；想立刻收起还是 `alt+t`。`agent_settled` 与本扩展无关。
