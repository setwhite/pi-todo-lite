# 配置项说明

这份文档逐个讲每个配置项：**管什么、默认值、改了会怎样、代价是什么**。

21 个键与读法在 2026-10-16 已冻结；要加键或删键，先改 `docs/PLAN.md` 的「不做项」。

## 1. 配置文件怎么读

- 路径：`<agent dir>/pi-todo/config.json`。`<agent dir>` 先看环境变量 `PI_CODING_AGENT_DIR`，没设就是 `~/.pi/agent`。
- 扩展**只读不写**，不会帮你生成配置。
- 文件不存在 → 全部用默认值，不报错。
- JSON 写坏、字段名不认识、类型或枚举写错 → **直接抛错**，消息里带配置文件绝对路径 + 逐条 `字段路径: 原因`，会话启动就红给你看。
- 数值超出范围 → **不报错，夹到上下限**（clamp）。比如 `maxLines: 50` 会变成 10。

## 2. 键表（21 个键）

### 组 1 · 工具与协议

| 键 | 默认 | 取值 | 管什么 | 什么时候想改 | 代价 |
|---|---|---|---|---|---|
| `tools.todo.name` | `"todo"` | 字母开头，字母数字下划线 | 工具名 | 本机还装着 rpiv-todo-lean，两个都注册 `todo` 会撞名 | 改名后我们文案里的「用 todo」也得跟着改；两个扩展同时开会给模型两个工具，容易挑错 |
| `plan.maxTasks` | `20` | 1–200 | 表里最多几条，超了这次调用直接失败 | 任务真的超过 20 条 | 表越长，模型每次整表重发的输出 token 越多；widget 反正只显示 9 行 |
| `plan.maxSubjectChars` | `120` | 20–400 | 每条 content 最长多少字符（按 Unicode code point 计，emoji 算 1） | 你写长句任务 | 80 列终端一行大概放得下 120 个英文字符；超了会换行，把 widget 的 10 行预算吃光 |
| `plan.requireSingleInProgress` | `false`（默认放开并行） | true / false | 是否只允许一条 `in_progress` | 想收敛成一次只干一件时设 `true` | 放开后表头不能再说「现在在做哪件」，同一条 guideline 也得改成允许多条并行；设 `true` 时模型同时开两条会直接报错要求重写 |

> **出处说明**：rpiv 这两项都没有 —— 它的配置只有 `guidance`、`maxWidgetLines`（默认 12，低于 3 回退默认，无上限）、`collapseKey`（默认 `ctrl+shift+t`，可设 `off`）三个字段（`@juicesharp/rpiv-todo/config.ts:5-16,37-41`）。任务条数不设限，溢出只在渲染时处理：先丢 completed，再砍非完成项的尾巴，尾部一行汇总（`state/selectors.ts:65-95`）。subject 不截长度，只校验非空 + 清掉终端控制字符（`state/state-reducer.ts:100`、`tool/sanitize.ts:8-24`），宽度按终端列数用 `truncateToWidth(line, width, "…")` 砍（`todo-overlay.ts:144`）。
>
> `maxTasks` 20 和 `maxSubjectChars` 120 都是你定的；120 的依据是 80 列终端一行大概放得下这么多英文字符。

### 组 2 · 屏幕上那块 widget

| 键 | 默认 | 取值 | 管什么 | 什么时候想改 | 代价 |
|---|---|---|---|---|---|
| `ui.widget.enabled` | `true` | true / false | 显不显示这块 | 屏幕小 / 嫌吵 | 关掉后模型照旧用表，只是你看不见 |
| `ui.widget.maxLines` | `9` | 3–10 | 最多几行 | 想多看点 | pi 对字符串数组形式的 widget 硬截 10 行（`interactive-mode.js:1871-1879`）；我们用组件工厂自己裁，所以上限就是 10 |
| `ui.widget.placement` | `"aboveEditor"` | aboveEditor / belowEditor | 放输入框上面还是下面 | 上面挡了别的东西 | 无，纯位置 |
| `ui.widget.showCompleted` | `true` | true / false | 已完成的是否逐条列出 | 只想看还剩什么 | 关了之后已完成的只在表头计数里出现 |
| `ui.widget.header` | `"Todo {done}/{total} · {doing} doing"` | 带占位符的模板 | 表头那行写什么（只放计数，不写任务文本） | 想显示「还剩几件」 | 占位符只有三个：`{done}` `{total}` `{doing}`；`{doing}` 为 0 时「· 0 doing」整段不显示，全完成就是 `Todo 5/5`；写错的占位符当普通文本（不报错） |
| `ui.widget.glyphs` | `{ pending: "[ ]", inProgress: "[-]", completed: "[x]" }` | 三个短字符串 | 三种状态的字形 | 想换符号 / 保持纯 ASCII | 字形太长会挤掉任务文本 |
| `ui.widget.completedStyle` | `"strikethrough"` | strikethrough / dim / plain | 已完成的样式 | 某些终端删除线不好看 | 无 |
| `ui.shortcut.toggle` | `"alt+t"` | 键位字符串 | 折叠 / 展开 widget | 想换键 | `ctrl+shift+t` 是 pi 内建 `app.session.tree` 的默认键（`docs/keybindings.md:17`），别用；撞键后 pi 有诊断但行为是哪个先抢到算哪个 |

> TUI 上所有文案（表头、字形、`/todos` 输出、导入导出的提示）**统一英文、简短直白** —— 你定的。

### 组 3 · 干完以后

| 键 | 默认 | 取值 | 管什么 | 什么时候想改 | 代价 |
|---|---|---|---|---|---|
| `lifecycle.onFinish` | `"model"` | model / keep / fade | 清单干完怎么收场 | 想让它自己消失 | `model` = 靠模型干完那次调用传空表；`keep` = 留着当本次会话的存档；`fade` = 整表完成后，等模型下一次**回复里没有工具调用**（说明它这波活干完、开始纯聊天）时自动收起 —— 事件驱动，不设时钟不设秒数 |

### 组 4 · 命令

| 键 | 默认 | 取值 | 管什么 | 什么时候想改 | 代价 |
|---|---|---|---|---|---|
| `commands.todos.enabled` | `true` | true / false | `/todos` 开关 | 不想要这个命令 | 无 |
| `commands.export.enabled` | `true` | true / false | `/todos export` 开关 | 从不导出 | 无 |
| `commands.export.dir` | `""` | 目录路径 | 导出到哪 | 想固定放某个目录 | 默认空 = 项目根 |
| `commands.export.fileNamePattern` | `"todo-{timestamp}.md"` | 带 `{timestamp}` 的模板 | 导出文件名 | 想换命名 | `{timestamp}` 形如 `20261016-1030`；模板里没有它就会覆盖同名文件 |
| `commands.import.enabled` | `true` | true / false | `/todos import <文件>` 开关 | —— | 只吃 markdown checklist（`- [ ] 任务` / `- [x] 任务`）一种格式，不解析 JSON；只在表是空的时候允许导，避免把模型的表冲掉 |

> `/todos` 打清单走对话区底部那行灰字（`notify`，多行）：不进模型上下文、不写会话文件、不花 token。

### 组 5 · 给模型看的文案

| 键 | 默认 | 取值 | 管什么 | 什么时候想改 | 代价 |
|---|---|---|---|---|---|
| `guidance.description` | 我们的成品（37 字符） | 字符串 | 覆盖工具描述 | 换模型（deepseek / gemini）措辞要试 | 写长了每轮都付 token |
| `guidance.promptSnippet` | `""` | 字符串 | 覆盖工具清单那行 `- todo: …` | 想省 token | 留空即不出现；`codemode.mode: "only"` 下这行本来就不渲染 |
| `guidance.promptGuidelines` | 我们的成品（2 条，占位符 146 / 替成 `todo` 后 136 字符） | 字符串数组 | 覆盖 guidelines | 同上 | **整组替换，不是合并**；写太多每轮都付 |

模型侧文案定稿在 `prompt/my prompt new/`（description / snippet / guidelines / schema，2026-10-16），T6 搬进 `index.ts` 之后代码就是唯一副本；整个 `prompt/` 不进仓库、不进 npm 包。

**上限数字（120 字符 / 20 条）不写进任何文案** —— 它会跟本文件的配置脱钩，改了配置文案就成了假话；真被拦下时报错消息会带出真实上限。

## 3. 明确不做的键

- 整个扩展的 `enabled`：不想用就在 settings 里卸掉，扩展自己加个开关没有意义。
- `timeoutMs`、`apiKeys`、`proxy`：这是 pi-web-search-lite 那种打网络的扩展才需要的，我们不联网。
- 主题色、字体：跟着 pi 的主题走，扩展不该自己定颜色。
- 语言开关（i18n）：widget 上那几个词是固定的，模型侧文案由 `guidance.*` 整组覆盖，再加一个语言字段是重复的。
- `nudge.*`：等真决定做收尾提醒时再加（现在没做）。

## 4. 一份写满的样例

```json
{
  "tools": { "todo": { "name": "todo" } },
  "plan": { "maxTasks": 20, "maxSubjectChars": 120, "requireSingleInProgress": false },
  "ui": {
    "widget": {
      "enabled": true,
      "maxLines": 9,
      "placement": "aboveEditor",
      "showCompleted": true,
      "header": "Todo {done}/{total} · {doing} doing",
      "glyphs": { "pending": "[ ]", "inProgress": "[-]", "completed": "[x]" },
      "completedStyle": "strikethrough"
    },
    "shortcut": { "toggle": "alt+t" }
  },
  "lifecycle": { "onFinish": "model" },
  "commands": {
    "todos": { "enabled": true },
    "export": { "enabled": true, "dir": "", "fileNamePattern": "todo-{timestamp}.md" },
    "import": { "enabled": true }
  },
  "guidance": { "description": "...", "promptSnippet": "", "promptGuidelines": ["..."] }
}
```

## 5. 代价提醒

每多一个键 = 多一份校验代码 + 多一条文档 + 多一种「自己配错然后来查为什么」的机会。判据只有一条：**你真的会为了它去开一下 config.json 吗**。不会的键就别加。

## 已定（本轮你拍板的）

- 任务文本上限 120 字符，超了这次调用失败；表超过 20 条也整次失败。
- 「正在做」不设条数上限，并行随便开。
- 表头 `Todo 2/5 · 1 doing`，`doing` 为 0 时不显示后半段。
- `/todos` 输出走底部灰字；`/todos import` 只吃 markdown checklist。
- TUI 文案统一英文；配置读取单文件 `config.ts`；版本 `0.1.0` + MIT + setwhite。
- 文档只留 `PLAN.md` + `CONFIG.md` 两份，重复内容不抄第二遍、只放指针；架构与任务表等 PLAN 批准后再写。
- `glyphs` / `completedStyle` 保留可配，不从键表删。
- fade 不用时钟：等模型下一次「回复里没有工具调用」时收起；`lifecycle.fadeSeconds` 随之删掉，键表 22 → 21。

## 待你定

- [ ] 开发期怎么处理与本机 rpiv-todo-lean 的 `todo` 撞名（你说留到开发时再定）
