# ARCHITECTURE — pi-todo-lite

> 状态：已批准（2026-10-16）
> 这里只放边界与约定。决策理由在 `docs/PLAN.md`，配置键在 `docs/CONFIG.md`，模型侧文案写在 `index.ts` 的注册参数里（本机对照稿在 `prompt/my prompt new/`，不入仓库），每个模块的内部契约在 `docs/modules/`。

## 模块

四个平铺文件，按功能切；每个模块一份 README。

| 文件 | 一句话职责 | 依赖 | README |
|---|---|---|---|
| `index.ts` | 接线：读配置 → 注册工具、命令、事件 → 调 `setWidget` / `appendEntry` | `plan.ts` `view.ts` `config.ts` | `docs/modules/index.md` |
| `plan.ts` | 计划语义：类型、校验、回放、给模型的文本 | 无 | `docs/modules/plan.md` |
| `view.ts` | 显示与文本：widget 行、`/todos` 文本、markdown 导出与解析 | `plan.ts`（只取类型） | `docs/modules/view.md` |
| `config.ts` | 读 `config.json`、默认值、校验、clamp | `node:fs` `node:path` `node:os` | `docs/modules/config.md` |

**依赖只能从左往右**，反向引用不允许。`plan.ts` / `view.ts` / `config.ts` 一律不 import pi 的包、不 import 宿主类型 —— 入参出参都是普通值，所以测试不用 mock 宿主。

**宿主 API 只出现在 `index.ts`**，且只用 `import type`（注册用的方法都由 pi 以参数注入）。UI 同理：组件工厂拿到的 `tui` / `theme` 只在 `index.ts` 里用，算行的纯逻辑在 `view.ts`。

## 数据流

- 写：模型调 `todo(tasks)` → `plan.validateTasks` → `pi.appendEntry("pi-todo-state", { tasks })` → `view.renderWidget` → `setWidget`。
- 读：`session_start` / `session_compact` / `session_tree` → `plan.replayTasks(getBranch())` → 同上重画。
- `/todos` 子命令走 `ctx.ui.notify`，不进模型上下文、不写会话文件。

## 代码放置规则

- 加东西先问属于谁：语义与校验 → `plan.ts`；显示与文本 → `view.ts`；配置键 → `config.ts`（类型、默认值、校验三处一起改）；只有注册或调宿主时才碰 `index.ts`。
- 不建 `utils.ts` / `types.ts` / `constants.ts` 这类没有主人的文件；类型跟着用它的模块走。
- 模型侧文案只有一个副本：**写在 `index.ts` 的注册参数里**（T6 从 `prompt/my prompt new/` 搬入）。`prompt/` 是你本机的对照素材，已在 `.gitignore` 里 —— 不进仓库、不进 npm 包、不参与构建。
- 文件名：小写、单数名词，一个文件一个职责。
- 新配置键必须同时出现在 `docs/CONFIG.md` 键表、`config.ts` 默认值、样例 JSON 三处，缺一处算没做完。

## 模块 README

位置 `docs/modules/<模块名>.md`。模块是单文件、不建目录，所以 README 不进源码树。每份写：内部契约（签名、异常、字段）、用法、取舍。**不写决策理由**（在 PLAN），**不抄键表**（在 CONFIG）。

## 测试

- 根 `test/`，按模块镜像：`test/plan.test.ts`、`test/view.test.ts`、`test/config.test.ts`。
- `index.ts` 不写单测 —— 它是接线，靠 AC4 真机跑一次验收。
- vitest；`pnpm test` 与 `pnpm typecheck`（`tsc --noEmit`）在干净克隆上都必须通过（AC7）。
- 喂普通值：回放用例直接手写 entries 数组；渲染用例把宽度当参数传（40 / 80 / 120），不读 `process.stdout.columns`；配置用例用注入的 `configPath` 与 `env`，不碰真实 home。
- 用例按 PLAN 的验收标准写，脚本用例为主。

## 错误处理约定

- 两类错误都是 `Error`，靠消息前缀区分：
  - 配置错：`pi-todo config <绝对路径>: <字段路径>: <原因>`（加载期抛，会话启动就红给你看）
  - 工具参数错：`todo: <第几条>: <原因>`（调用期抛，模型从消息里学到真实上限）
- 真实上限不写进模型侧静态文案，只出现在报错消息与 `docs/CONFIG.md`。
- UI 调用一律容错：`ctx.ui` 缺失或 `setWidget` 不可用（RPC / print 模式）时静默跳过，状态照旧落账。

## Coverage check（PLAN 的每个阶段都有模块承接）

| PLAN 条目 | 承接 |
|---|---|
| 工具 + 校验（AC1） | `plan.ts` 的 `validateTasks` + `index.ts` 注册 |
| 写账 + 回放（AC2） | `plan.ts` 的 `replayTasks` + `index.ts` 三个会话事件 |
| widget（AC3 / AC4） | `view.ts` 行渲染 + `index.ts` 组件工厂与 `setWidget` |
| 配置骨架 | `config.ts` |
| 模型侧文案 | `prompt/my prompt new/` → `index.ts` 注册参数 |
| M2：`/todos` 四命令（AC5） | `view.ts` 文本与 markdown + `index.ts` 注册 |
| M2：折叠键 `alt+t` | `config.ts` 键 + `index.ts` |
| M3：打包、CI、发布 | 仓库根 `package.json` / `tsconfig.json` / `.github/workflows/`（不属任何模块） |
