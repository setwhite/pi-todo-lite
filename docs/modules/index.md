# index.ts

唯一 import pi 的文件，只做接线。

## 注册清单

| 东西 | 说明 |
|---|---|
| 工具 `${config.tools.todo.name}`（默认 `todo`） | `label: "Todo"`；参数 schema 三个字段全必填、零字段文案、内外层都 `additionalProperties: false`（与 `plan.ts` 的未知键拒绝同一件事）；`executionMode: "sequential"`；handler：`validateTasks` → `appendEntry(STATE_CUSTOM_TYPE, { tasks })` → 更新内存状态 → `requestRender()` → 返回 `formatTasks` 的文本（`details` 留空，状态只写 custom entry） |
| 事件 `session_start` / `session_compact` / `session_tree` | 调 `replayTasks(ctx.sessionManager.getBranch())` 后重画 widget（三个事件同一套） |
| widget key `"todo"` | 组件工厂返回 `{ render(width), invalidate() }`；组件每次 render 都读 live 状态、不缓存（`invalidate()` 空转）；`placement` 取配置；状态变化后 `requestRender()`；`ui.widget.enabled: false` 时压根不设 widget |
| 命令 `/todos` | 名字是常量 `COMMAND_NAME`（`"todos"`，撞名问题见 `docs/TODO.md` T8 偏差）；`commands.todos.enabled: false` 时压根不注册；`description: "Show or edit the todo list"`；子命令见下 |

### `/todos` 子命令

| 参数 | 行为 |
|---|---|
| 空 | `notify(renderList(tasks, widgetConfig))`（info）——全列、不截断 |
| `clear` | 带多余参数 → 用法 warning（不清）；否则 `commit([])`（写一条空表账）后 `notify("Cleared")`（info） |
| `export` | `commands.export.enabled: false` → warning；带多余参数 → 用法 warning；名字模板不是文件名（空 / 带 `/`、`\`）→ error `commands.export.fileNamePattern must be a file name, got "…"`；否则 `toMarkdown` → 写盘（目录 `commands.export.dir`，空 = `ctx.cwd`；文件名 `exportFileName(commands.export.fileNamePattern, new Date())`；`wx` 写入，EEXIST 就试 `name-2`、`name-3`…，最多 100 次）→ `notify("Exported N tasks to <绝对路径>")`。**写盘失败（EEXIST / EACCES / …）只 notify(error)，不抛回宿主** |
| `import <file>` | `commands.import.enabled: false` → warning；缺文件名 → 用法 warning；表非空 → warning（不动表）；读文件失败 → error；否则 `parseChecklist` → `validateTasks`（同一个上限）→ `commit` → `notify("Imported N tasks from <绝对路径>")`，校验失败把 `plan.ts` 的消息原样 notify（error） |
| 其它 | 用法 warning（`Usage: /todos [clear | export | import <file>]`），不动状态 |

- 参数解析：`/^(\S+)(?:\s+([\s\S]*))?$/` 套在 `args.trim()` 上 —— 子命令是第一个词，**剩下的是整段原文**（`import a  b.md` 里的连续空格要留住），只有 `import` 的路径会再剥一层配对引号（`"a  b.md"` / `'a  b.md'`）。
- 文件 IO（`fs` / `path`）只在 `index.ts`：命令的落盘与读盘是接线的一部分，`view.ts` 只算文本、`plan.ts` 只判语义。

## 约定

- pi 的类型只用 `import type` 引（`node:fs` / `node:path` / typebox 是值 import）；注册方法（`registerTool` / `registerCommand` / `on` / `appendEntry` / `setWidget`）都由 pi 注入。
- description / guidelines 从 `config.guidance.*` 取（`DEFAULTS` 里就是 `prompt/my prompt new/` 的定稿正文），注册时把每条 guideline 里的 `tool-name` 替成配置里的真实工具名（出现几次替几次，`replaceAll`）；`promptSnippet` 为空就不写这个键。参数 schema 写在这个文件里，字段文案留空。
- 会话快照的 `customType` 用 `plan.ts` 导出的 `STATE_CUSTOM_TYPE`，不写死字符串。
- 所有 UI 调用容错：没有 `ctx.ui` 或 `setWidget` / `notify` 不可用时静默跳过（状态照旧落账）。
- 校验失败把 `Error` 抛出去，让 pi 回给模型；不要自己 catch 掉。
- 但命令面相反：**handler 自己的异常一律 catch 成 `notify(error)`**。抛出去宿主只会记成 `extension_error`（用户在对话区看不到任何提示），脚本也拿不到可读原因。这条覆盖 `export` / `import` 的所有失败路径。

## 取舍

- 不注册 status line、不做 nudge、不监听 `agent_settled`（M2 的 fade 才会加）。
- 命令名不做成配置键：加了要动 `docs/CONFIG.md` 冻结的 21 键（见 `docs/TODO.md` T8 偏差），现在写成常量。
- 接线用 fake api + fake ctx（`registerTool` / `registerCommand` / `on` / `appendEntry` / `ui.setWidget` / `ui.notify` / `sessionManager.getBranch`）测，见 `test/index.test.ts`：只断言**我们交给 pi 的东西**（注册的文案与 schema、写出的 entry、widget 的行、notify 的文案）与命令真正落盘的文件，不测 pi 自己的校验、事件顺序与渲染。真机在 T7（TUI）与 T8 的 RPC 跑。
