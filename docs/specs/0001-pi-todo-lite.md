# SPEC · pi-todo-lite

> 契约 = 用户故事 + 验收表（AC）+ 不做的清单。改这三样先改这里；字段、默认值、报错、命令细节一律看源码。
> 只写代码里读不出的东西。为什么这么定见 `docs/decisions/`，模块见 `docs/ARCHITECTURE.md`，术语见 `docs/GLOSSARY.md`。

## 问题

本机原来用 `@ssk_dev/rpiv-todo-lean`：模型侧 250 tok，底下是 5000 行引擎（依赖 DAG、4 状态机、9 语言、overlay、12 字段协议）。功能远超需要，出问题不好改。

要的只有三件：**纪律**（模型维护一份有序计划，不丢线程）、**可见性**（不翻 transcript 就知道现在在干什么）、**耐久**（会话重放之后表还在）。

用户：我自己，TUI 为主、偶尔 RPC。

## 用户故事

- 输入框上方常驻一块表，不翻 transcript 就知道做到第几步、还剩几件。
- 一次调用交完整张表（谁完成、谁开工一起说），不为两次改动付两次往返。
- compaction / 切分支 / `--continue` 之后表还在（整表已完成且配了自动清空时除外）；状态只写一条自己的账，回放只有一条读取路径。
- 超长或带控制字符的任务整次退回，屏幕上不出现骗人的一行。
- 表头与条目按终端宽度截断、超预算先丢已完成；`alt+t` 能折叠它而任务表一寸不动。
- `/todos` 看全表、清空、导出 markdown、再从 markdown 读回，计划能跨工具搬运。
- 配置写错时立刻看见带字段路径的报错，数值越界自动夹到区间。
- 模型侧一整段 ≤ 120 tok。
- 工具名可改；清单干完能按 `lifecycle.onFinish` 选收场（模型收 / 留着 / 整表完成后等用户下一条消息再清；默认这一档）。

## 协议

`todo(tasks)`：一次调用提交完整有序清单，整表替换；没有 id / key / action / baseVersion（理由见 [`D01`](../decisions/D01-whole-table-snapshot.md)）。

字段、约束、报错文案、参数 schema 全在 `src/plan.ts` 与 `src/index.ts`，对应 `test/plan.test.ts` / `test/index.test.ts`。

留在这的取舍：参数 schema 故意不写字段文案、不加数值约束 —— 只要带上，签名就从一行炸成多行（实测 88 → 194 字符）；上限数字写进文案就会跟 `config.json` 脱钩，真被拦下时由报错消息带出。

## 状态与回放

写入与读取各只有一条路径（接线在 `src/index.ts`；理由见 [`D02`](../decisions/D02-state-only-own-ledger.md)）。

留在这的取舍：账本侧口子宽、模型侧口子严 —— 回放跳过坏条目，写入整次退回。合并两侧只会让一边变松。模型侧只有 `onFinish: "model"` 档注册「干完发空表能清」那条 guideline：keep 要留成存档、clear 会自己清，这两档知道只会拆台。

## 界面

表头、行预算、截断、折叠键在 `src/view.ts`，对应 `test/view.test.ts`。

留在这的取舍：widget 与 `/todos` 的清单故意相反 —— widget 按宽度截断、按预算取舍，清单全列不截断。合并会把清单的用处弄丢；行预算溢出时坚持「宁可少显示一行，也不把做完的顶回来」，也不用 completed 回填空位。

折叠键选 `alt+t` 而不选 `ctrl+shift+t`，因为后者是 pi 内建 `app.session.tree` 的默认键。

## 配置与命令

配置键、默认值、校验、报错在 `src/config.ts`；键表在 README 的配置节；命令集合在 `src/index.ts`。

留在这的口径：扩展只读配置（见 [`D04`](../decisions/D04-config-read-only.md)）；工具面把 `Error` 抛给 pi，命令面一律 catch 成 `notify` —— 抛出去宿主只记 `extension_error`，用户在对话区看不到原因；UI 不可用时静默跳过、状态照旧落账。

## 测试与验收

- 根 `test/` 按模块镜像。`index.ts` 用 fake api + fake ctx，只断言**我们交给 pi 的东西**（注册的文案与 schema、写出的 entry、widget 的行、notify 的文案、真落盘的文件），不测 pi 自己的校验与渲染。
- 喂普通值：回放用例手写 entries；渲染用例把宽度当参数传（40 / 80 / 120），不读 `process.stdout.columns`；配置用例注入 `configPath` 与 `env`，不碰真实 home。

| | 验收 |
|---|---|
| AC1 | 校验用例：空 content、超长、超条数、非法 status、非数组 —— 全部拒绝，且状态不变 |
| AC2 | 回放用例：一串 entries（中间混入坏条目）取到最后一条有效快照；一条都没有时是空表 |
| AC3 | 渲染用例：0 / 1 / 20 条 × 宽度 40 / 80 / 120 —— 行数、`…` 截断、`+N more` 都符合预期 |
| AC4 | 真机：起一个 ≥ 3 步的任务，表出现在输入框上方；`/todos` 打出清单；`tasks: []` 后 widget 消失 |
| AC5 | `/todos export` 吐出的 markdown 能被 `/todos import` 原样读回 |
| AC6 | 模型侧开销 ≤ 120 tok：description + guidelines + 工具签名那一行 |
| AC7 | 干净克隆上 `pnpm lint && pnpm typecheck && pnpm test` 通过；CI 三个矩阵格全绿 |
| AC8 | 自动清空：`lifecycle.onFinish: "clear"`（默认）时，整表 `completed` 之后用户再发一条消息，会话里多一条空表快照、回放得到空表、widget 变空；还有未完成项、或用户还没发下一条时都不写账 |

## 不做的

- 项目级持久化（跨会话 / 跨 cwd 的存储）；跨天的清单归 `docs/todos/`。
- nudge 与 steer（理由见 `docs/decisions/D03-no-nudge.md`）、status line。
- 自定义 `renderCall` / `renderResult`、`prepareArguments` 容错层、日志与调试开关。
- 子代理看板；`key` / `baseVersion`；i18n。
- 压缩后忘表的兜底：表只活在模型上下文里，被 compaction 截掉后模型不知道表内容、widget 却还在显示 —— 先不做，等真观察到症状再议。
- 明确不做的配置键：整个扩展的 `enabled`、`timeoutMs` / `apiKeys` / `proxy`、主题与字体、语言开关、`nudge.*`。

这份清单是契约，要加得先改这份 spec。

## 其他

- **影响范围**：装上之前要卸掉 `@ssk_dev/rpiv-todo-lean`（两个都注册 `todo`）；开发期用 `pi -ne -e ./src/index.ts` 绕开。不动 `settings.json`；除 `/todos import|export` 显式指定外不读项目内文件。
- **回退**：卸包、装回 lean 版；会话里已经写下的快照条目留着不影响任何东西。
- **交付形态**：npm 包 `pi-todo-lite`，MIT 许可、作者 setwhite。包内有什么由 `package.json` 的 `files` 决定，`test/package.test.ts` 守住。
- **已知偏差与口径**：
  - markdown 只有两态：`in_progress` 导出成 `- [ ]`、读回变 `pending`（`Todo 0/3 · 1 doing` → `Todo 0/3`）。
  - `/todos` 与本机的 `@ssk_dev/rpiv-todo-lean` 撞名（改命令名要动 `src/index.ts` 与 README 的用法说明）；待办登记在 `docs/todos/`。
  - headless（`-p`）下 `ctx.hasUI` 为 false，widget 只能真 TUI 验；winpty 退出码 58 是 `/exit` 之后 pi 的退出码、不是扩展报错；宿主另有 `MAX_WIDGET_LINES = 10`。
  - 真机 TUI 抓包里样式序列计数为 0：pi 的样式走 chalk，抓包时 stdout 是管道、chalk level 0 —— 不是没生效，可见效果要在真人终端看。
