# index.ts

唯一 import pi 的文件，只做接线。

## 注册清单

| 东西 | 说明 |
|---|---|
| 工具 `${config.tools.todo.name}`（默认 `todo`） | `label: "Todo"`；参数 schema 三个字段全必填、零字段文案、内外层都 `additionalProperties: false`（与 `plan.ts` 的未知键拒绝同一件事）；`executionMode: "sequential"`；handler：`validateTasks` → `appendEntry(STATE_CUSTOM_TYPE, { tasks })` → 更新内存状态 → `requestRender()` → 返回 `formatTasks` 的文本（`details` 留空，状态只写 custom entry） |
| 事件 `session_start` / `session_compact` / `session_tree` | 调 `replayTasks(ctx.sessionManager.getBranch())` 后重画 widget（三个事件同一套） |
| widget key `"todo"` | 组件工厂返回 `{ render(width), invalidate() }`；组件每次 render 都读 live 状态、不缓存（`invalidate()` 空转）；`placement` 取配置；状态变化后 `requestRender()`；`ui.widget.enabled: false` 时压根不设 widget |
| 命令 `/todos`（M2） | 清单 / `clear` / `export` / `import <file>`，输出一律 `ctx.ui.notify` |

## 约定

- 只 `import type`；注册方法（`registerTool` / `registerCommand` / `on` / `appendEntry` / `setWidget`）都由 pi 注入。
- description / guidelines 从 `config.guidance.*` 取（`DEFAULTS` 里就是 `prompt/my prompt new/` 的定稿正文），注册时把每条 guideline 里的 `tool-name` 替成配置里的真实工具名（出现几次替几次，`replaceAll`）；`promptSnippet` 为空就不写这个键。参数 schema 写在这个文件里，字段文案留空。
- 会话快照的 `customType` 用 `plan.ts` 导出的 `STATE_CUSTOM_TYPE`，不写死字符串。
- 所有 UI 调用容错：没有 `ctx.ui` 或 `setWidget` 不可用时静默跳过。
- 校验失败把 `Error` 抛出去，让 pi 回给模型；不要自己 catch 掉。

## 取舍

- 不注册 status line、不做 nudge、不监听 `agent_settled`（M2 的 fade 才会加）。
- 接线用 fake api + fake ctx（`registerTool` / `on` / `appendEntry` / `ui.setWidget` / `sessionManager.getBranch`）测，见 `test/index.test.ts`：只断言**我们交给 pi 的东西**（注册的文案与 schema、写出的 entry、widget 的行），不测 pi 自己的校验、事件顺序与渲染。真机（`pi -e ./index.ts`）在 T7。
