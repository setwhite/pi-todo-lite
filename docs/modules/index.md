# index.ts

唯一 import pi 的文件，只做接线。

## 注册清单

| 东西 | 说明 |
|---|---|
| 工具 `${config.tools.todo.name}`（默认 `todo`） | 参数 schema 三个字段全必填、零字段文案；`executionMode: "sequential"`；handler：`validateTasks` → `appendEntry("pi-todo-state", { tasks })` → 返回 `formatTasks` 的文本 |
| 事件 `session_start` / `session_compact` / `session_tree` | 调 `replayTasks` 后重画 widget |
| widget key `"todo"` | 组件工厂返回 `{ render(width), invalidate() }`；`placement` 取配置；状态变化后 `requestRender()` |
| 命令 `/todos`（M2） | 清单 / `clear` / `export` / `import <file>`，输出一律 `ctx.ui.notify` |

## 约定

- 只 `import type`；注册方法（`registerTool` / `registerCommand` / `on` / `appendEntry` / `setWidget`）都由 pi 注入。
- description / guidelines / 参数 schema 直接写在这个文件里，文案从 `prompt/my prompt new/` 抄；文件里的 `tool-name:` 是占位符，代码里替成配置里的真实工具名。
- 所有 UI 调用容错：没有 `ctx.ui` 或 `setWidget` 不可用时静默跳过。
- 校验失败把 `Error` 抛出去，让 pi 回给模型；不要自己 catch 掉。

## 取舍

- 不注册 status line、不做 nudge、不监听 `agent_settled`（M2 的 fade 才会加）。
- 接线不写单测，靠 AC4 真机验收。
