# SPEC · pi-todo-lite

> 状态：M1 / M2 已验收（2026-10-17），M2.5（auto-clear）已验收（2026-10-18），M3 进行中（T13 / T14 已验收，T15 待做）—— 进度见 `docs/TODO.md`。
> 这是唯一的契约：改协议、加命令、动验收标准都先改这里。为什么这么定见 `docs/DECISIONS.md`，键表见 `docs/CONFIG.md`。
> 只写代码里读不出的东西 —— 签名、导出、逐条行为一律看源码。

## 问题

本机原来用 `@ssk_dev/rpiv-todo-lean`：模型侧 250 tok，底下是 5000 行引擎（依赖 DAG、4 状态机、9 语言、overlay、12 字段协议）。功能远超需要，出问题不好改。

要的只有三件：**纪律**（模型维护一份有序计划，不丢线程）、**可见性**（不翻 transcript 就知道现在在干什么）、**耐久**（compaction、切分支、`--continue` 之后表还在）。

用户：我自己，TUI 为主、偶尔 RPC。目标约 400 行、零运行时依赖、状态只写一条自己的账；最终发到 npm 当 `pi-todo-lite`。

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

`todo(tasks)`：一次调用提交完整有序清单，**整表替换**。没有 id、key、action、baseVersion。

| 字段 | 必填 | 约束 |
|---|---|---|
| `tasks` | 是 | 数组，≤ `plan.maxTasks`；顺序即显示顺序；`[]` 表示清空 |
| `tasks[].content` | 是 | trim 后非空、单行纯文本（无 `\p{Cc}` / `\p{Zl}` / `\p{Zp}` / `\p{Cf}`），≤ `plan.maxSubjectChars` 个 code point |
| `tasks[].status` | 是 | `pending` \| `in_progress` \| `completed`；没有 `deleted`（删 = 不出现在表里） |

- 全有或全无：任一项不合规就抛错、状态一动不动，一次列完所有违规，每行都带工具名前缀与第几条。报错不回显正文（字符串超 32 字符截断，容器只说形状）。
- 未知键在顶层与项内都拒绝、不静默剥离；注册的 schema 也是 `additionalProperties: false`，让模型更早看到同一件事。长度按 code point 计；控制字符按类报名字 + U+ 码点（不做字符对照表），不做白名单 —— ZWJ 组字 emoji 一并拒。
- 参数 schema 不写字段文案、不加数值约束：只要带上，签名就从一行炸成多行（实测 88 → 194 字符）。上限数字（120 / 20）不写进任何文案 —— 它会跟 `config.json` 脱钩，真被拦下时由报错消息带出。
- 返回值：文本 = 完整清单 + 一行进度（供模型自查）；`details` 留空。

## 状态与回放

- 写：`todo(tasks)` → `validateTasks` → `pi.appendEntry("pi-todo-state", { tasks })` → 重画。**不**写 toolResult 的 `details`。
- 读：`session_start` / `session_compact` / `session_tree` → `replayTasks(getBranch())` → 重画。取最后一条**有效**快照：坏条目整条跳过、继续往前扫；一条都没有 → 空表；不读 toolResult 的 details。
- 清空 = 写一条 `{tasks: []}` 快照：`/todos clear` 与 `lifecycle.onFinish: "clear"` 共用这条路 —— 账只有这一个写入路径。模型侧只有 `onFinish: "model"` 档知道「干完发空表能清」：keep 要留成存档、clear 会自己清，这两档知道只会拆台，那条 guideline 不注册。
- 账本侧口子宽、模型侧口子严：`replayTasks` 只认 `content`（trim 过）与 `status`，转义序列（CSI / OSC 等）**整条丢掉**、其余控制字符压成一个空格；`validateTasks` 则一律拒绝。
- `/todos` 的输出走 `ctx.ui.notify`：不进模型上下文、不写会话文件，RPC / print 下也拿得到。

## 界面

- widget 用组件工厂渲染（只有工厂能按终端列宽截断、自己控行预算）；表空传 `undefined` 让 widget 消失。
- 表头默认 `Todo {done}/{total} · {doing} doing`（`{doing}` 为 0 时整段省掉）；条目 = 字形 + 空格 + content。计数永远按整张表算，与显不显示无关。
- 行预算 `maxLines` 是总行数（表头占一行）：溢出**先整条丢 completed**，再砍非完成项的尾巴，末尾补一行 `+N more`（N 含被丢掉的 completed）。**不**用 completed 回填空位 —— 宁可少显示一行，也不把做完的顶回来。
- 两套相反取舍，别合并：widget 按宽度截断、按预算取舍；`/todos` 的 `renderList` 全列不截断 —— 清单的用处就是全看一遍。
- 截断按 code point 数、不做 East Asian width（CJK / emoji 算 1）；宽度在渲染期裁，表里存原文。已完成行的样式钩子在**截断之后**调用，所以样式序列不吃宽度。
- 折叠键默认 `alt+t`（`ctrl+shift+t` 是 pi 内建 `app.session.tree` 的默认键）：收起 = `setWidget(undefined)`，任务表一寸不动。

## 配置与命令

- 21 个键的默认值、区间、代价只在 `docs/CONFIG.md`（唯一键表，`test/docs.test.ts` 拿它跟 `DEFAULTS` 对账）。路径 `<agent dir>/pi-todo/config.json`，扩展**只读不写**；文件不存在 → 全默认值；JSON 坏 / 未知键 / 类型枚举错 → 抛错（消息带绝对路径与逐条 `字段路径: 原因`）；数值越界 clamp、非整数按类型错拒。
- `/todos`（全列清单）/ `clear` / `export`（markdown checklist，默认 `todo-{timestamp}.md`，同名让位不覆盖）/ `import <file>`（只吃 markdown checklist；表非空时拒绝；先宽松解析再严格校验）。命令名固定 `todos`，不做成配置键。
- 两面错误方向相反：工具面把 `Error` 抛给 pi 回给模型；命令面一律 catch 成 `notify(error)` —— 抛出去宿主只记 `extension_error`，用户在对话区看不到原因。
- UI 调用一律容错：没有 `ctx.ui`（RPC / print）或 `setWidget` / `notify` 不可用时静默跳过，状态照旧落账。

## 模块

源码全在 `src/`（四个平铺文件，不建目录）、测试在 `test/` 按模块镜像 —— 仓库根只放配置与文档。**依赖只能从左往右**，反向引用不允许；`plan.ts` / `view.ts` / `config.ts` 一律不 import 宿主包（入参出参都是普通值，测试因此不用 mock 宿主）；宿主 API 只出现在 `index.ts`，且只用 `import type`。

| 文件 | 职责 |
|---|---|
| `src/index.ts` | 入口（`package.json` 的 `pi.extensions`）与接线：读配置 → 注册工具 / 命令 / 事件 / 快捷键 → 调 `setWidget` / `appendEntry`。文件 IO（`fs` / `path`）只在这里 |
| `src/plan.ts` | 计划语义：类型、校验、回放、给模型的文本。不 import 任何东西 |
| `src/view.ts` | 显示与文本：widget 行、`/todos` 文本、markdown 导出与解析。只从 `plan.ts` 取类型 |
| `src/config.ts` | 读 `config.json`、默认值、校验、clamp。只碰 `node:fs` / `node:path` / `node:os` |

放置规则：语义与校验 → `plan.ts`；显示与文本 → `view.ts`；配置键 → `config.ts`（类型、默认值、校验、`CONFIG.md` 四处一起改）；只有注册或调宿主才碰 `index.ts`。`src/` 下不建 `utils.ts` / `types.ts` / `constants.ts`，类型跟着用它的模块走；`tsconfig.json` 的 `include` 只列 `src` 与 `test`，散在根目录的 `.ts` 不参与编译。

**不变量**：「`content` 单行、无控制字符与不可见字符、trim 过」由 `plan.ts` 在数据入口保证 —— 所以下游渲染不必再清终端控制字符、也不必防一条变多行。

刻意的重复（别急着抽）：`formatTasks` 的进度行与 widget 表头各一份模板；`describe` / `echo` 在 `config.ts` 与 `plan.ts` 各一份（重复到第三次再抽）。

## 测试与验收

- 根 `test/` 按模块镜像。`index.ts` 用 fake api + fake ctx，只断言**我们交给 pi 的东西**（注册的文案与 schema、写出的 entry、widget 的行、notify 的文案、真落盘的文件），不测 pi 自己的校验与渲染。
- 喂普通值：回放用例手写 entries；渲染用例把宽度当参数传（40 / 80 / 120），不读 `process.stdout.columns`；配置用例注入 `configPath` 与 `env`，不碰真实 home。
- 命令：`pnpm test`、`pnpm typecheck`，干净克隆上都必须通过。

| | 验收 |
|---|---|
| AC1 | 校验用例：空 content、超长、超条数、非法 status、非数组 —— 全部拒绝，且状态不变 |
| AC2 | 回放用例：一串 entries（中间混入坏条目）取到最后一条有效快照；一条都没有时是空表 |
| AC3 | 渲染用例：0 / 1 / 20 条 × 宽度 40 / 80 / 120 —— 行数、`…` 截断、`+N more` 都符合预期 |
| AC4 | 真机：起一个 ≥ 3 步的任务，表出现在输入框上方；`/todos` 打出清单；`tasks: []` 后 widget 消失 |
| AC5 | `/todos export` 吐出的 markdown 能被 `/todos import` 原样读回 |
| AC6 | 模型侧开销 ≤ 120 tok：description + guidelines + 工具签名那一行 |
| AC7 | 干净克隆上 `pnpm typecheck && pnpm test` 通过；CI 三个 job 绿 |
| AC8 | 自动清空：`lifecycle.onFinish: "clear"`（默认）时，整表 `completed` 之后用户再发一条消息，会话里多一条空表快照、回放得到空表、widget 变空；还有未完成项、或用户还没发下一条时都不写账 |

## 不做的

- 项目级持久化（跨会话 / 跨 cwd 的存储）；跨天的清单归仓库里的 `TODO.md`。
- nudge 与 steer（理由见 `docs/DECISIONS.md#3`）、status line。
- 自定义 `renderCall` / `renderResult`、`prepareArguments` 容错层、日志与调试开关。
- 子代理看板；`key` / `baseVersion`；i18n。
- 压缩后忘表的兜底：表只活在模型上下文里，被 compaction 截掉后模型不知道表内容、widget 却还在显示 —— 先不做，等真观察到症状再议。
- 明确不做的配置键（整扩展 `enabled`、`timeoutMs` / `apiKeys` / `proxy`、主题与字体、语言开关、`nudge.*`）列在 `docs/CONFIG.md`。

这份清单是契约，要加得先改这份 spec。

## 其他

- **影响范围**：装上之前要卸掉 `@ssk_dev/rpiv-todo-lean`（两个都注册 `todo`）；开发期用 `pi -ne -e ./src/index.ts` 绕开。不动 `settings.json`；除 `/todos import|export` 显式指定外不读项目内文件。
- **回退**：卸包、装回 lean 版；会话里已经写下的 `pi-todo-state` 条目留着不影响任何东西。
- **交付形态**：npm 包 `pi-todo-lite`，`0.1.0` + MIT + setwhite；宿主包只进 `peerDependencies` 且范围写 `*`。
- **已知偏差与口径**：
  - markdown 只有两态：`in_progress` 导出成 `- [ ]`、读回变 `pending`（`Todo 0/3 · 1 doing` → `Todo 0/3`）。
  - `/todos` 与本机的 `rpiv-todo-lean` 撞名，未解（改命令名要动冻结的 21 键与这份 spec 的「不做的」）。
  - headless（`-p`）下 `ctx.hasUI` 为 false，widget 只能真 TUI 验；winpty 退出码 58 是 `/exit` 之后 pi 的退出码、不是扩展报错；宿主另有 `MAX_WIDGET_LINES = 10`。
  - 真机 TUI 抓包里样式序列计数为 0：pi 的样式走 chalk，抓包时 stdout 是管道、chalk level 0 —— 不是没生效，可见效果要在真人终端看。
  - **待定**：模型侧文案按实测再调；两条 guideline 够不够让模型整表重发，待实测。
- **术语**（词打架时看这里）：
  - **表（table）**：本会话的完整清单，有序 `Task` 数组，整表提交。_别叫_ list / checklist / plan。
  - **Task**：`content` + `status`，没有 id、没有依赖。_别叫_ item / todo。
  - **status 三态**：`pending` / `in_progress` / `completed`，没有 `deleted`。文案与模板里数 `in_progress` 用 `doing`，协议与代码写 `in_progress`。
  - **快照**：`customType: "pi-todo-state"` 的 entry，每次变化写一条。_别叫_ state / checkpoint / 存档。
  - **回放**：从 `getBranch()` 由后往前取最后一条有效快照。_别叫_ restore / load。
  - **widget**：`setWidget` 那块表，key 是 `todo`。_别叫_ overlay / panel / status line。
  - **折叠（collapsed）**：把 widget 从屏幕上拿掉、再按一次回来；任务表一寸不动。_别叫_ hide / minimize。
  - **清空（clear）**：把表变成空表 —— 写一条 `{tasks: []}` 快照。与折叠的区别是它动账。_别叫_ reset / wipe。
  - **清单（renderList）**：`/todos` 打出的全表文本，不截断不省条目。别拿它指 widget 或表数据本身。
  - **导出 / 导入**：`/todos export` 吐 markdown、`import` 读回；两态有损。_别叫_ dump / 序列化。
  - **工具名（toolName）**：`tools.todo.name`，默认 `todo`；错误前缀与文案占位符都用它。_别叫_ commandName。
