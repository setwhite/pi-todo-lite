# PLAN — pi-todo-lite

> 状态：已批准（2026-10-16）
> 这份是唯一事实来源。键表只在 `docs/CONFIG.md` 存一份（21 个键，2026-10-16 你批准）、模型侧文案只有一个副本（写进 `index.ts` 的注册参数；本机对照稿在 `prompt/my prompt new/`，不入仓库），这里放指针不抄内容。

## 为什么做

本机现在用 `@ssk_dev/rpiv-todo-lean`：模型侧 250 tok，底下是 5000 行引擎（依赖 DAG、4 状态机、9 语言、overlay、12 字段协议）。功能远超需要，出问题不好改。

要的只有三件：

1. **纪律** —— 模型维护一份有序计划，不丢线程。
2. **可见性** —— 不翻 transcript 就知道现在在干什么。
3. **耐久** —— compaction、切分支、`--continue` 之后表还在。

**用户**：我自己。TUI 为主，偶尔 RPC。
**目标**：约 400 行、零运行时依赖、状态只写一条自己的账；最终发到 npm 当 `pi-todo-lite`。

## 决策

出处指针里 `dist/` 指 `@earendil-works/pi-coding-agent/dist/`；`rpiv` 指本机 `~/.pi/agent/npm/node_modules/@juicesharp/rpiv-todo`；「你拍板」= 本次规划会话里的决定。

| 决策 | 一句话理由 | 出处指针 |
|---|---|---|
| 交付形态：npm 包 `pi-todo-lite`，`pi.extensions` 指向 `./index.ts`；开发期用 `pi -e ./index.ts` | 你定了要发；开发期免安装、免构建 | `docs/packages.md`、`docs/cli.md` |
| 代码按功能切：`index.ts` 接线、`plan.ts` 计划语义、`view.ts` 显示、`config.ts` 配置 | 不按技术分层；加命令时只碰一个文件 | 你拍板 |
| 协议：单工具 `todo`，参数 `tasks: [{content, status}]` 整表替换；无 id、无 key、无 action、无 baseVersion | 一次调用能表达「1 完成 + 2 开工」；没有 id 就没有删后漂移，也不用教模型起名 | 对照 `rpiv/tool/types.ts:94-137`（12 字段那套） |
| 校验：content trim 后非空且 ≤ 120 字符（Unicode code point 计，emoji 算 1）、status 三选一、≤ 20 项、未知键拒绝；任一条不合格整次调用失败 | 全有或全无，模型立刻知道被拒，不会基于幻觉往下推 | 你拍板（20 / 120） |
| 状态载体：每次变化 `pi.appendEntry("pi-todo-state", { tasks })`，**不**写 tool result 的 `details` | `codemode.mode: "only"` 下模型经脚本调工具，嵌套调用不产生 toolResult，只靠 details 回放会丢状态 | `docs/extensions.md:149`、`docs/codemode.md:52`、对照 `rpiv/todo.ts:83-87` |
| 回放：`session_start` / `session_compact` / `session_tree` 扫 `getBranch()`，取最后一条 `type:"custom"` + `customType:"pi-todo-state"` 的有效快照；坏条目跳过继续往前扫 | 分支天然正确、抗 compaction；单一写入路径，不用两边比对 | `docs/session-format.md:166-172,226-248` |
| UI：`setWidget("todo", 组件工厂, { placement: "aboveEditor" })`，表空传 `undefined` 让 widget 消失 | 常驻可见；组件工厂才能按终端列宽截断、自己控行预算 | `dist/core/extensions/types.d.ts:101`、对照 `rpiv/todo-overlay.ts:144` |
| widget 内容：表头 `Todo {done}/{total} · {doing} doing` + 每项一行，ASCII 字形 `[ ]` / `[-]` / `[x]`，无 id、无 activeForm | 纯 ASCII 不挑字体；计数在表头、条目在下面 | 你拍板 |
| 溢出：行预算 `maxLines - 1`（表头占一行），先丢 completed，再砍非完成项的尾巴，尾部补一行 `+N more` | 人关心还剩什么，做完的只需计数 | 对照 `rpiv/state/selectors.ts:65-95` |
| 折叠键 `alt+t` | `ctrl+shift+t` 是 pi 内建 `app.session.tree` 的默认键，撞不得 | `docs/keybindings.md:17` |
| 配置：`<agent dir>/pi-todo/config.json`（`PI_CODING_AGENT_DIR` 优先），扩展只读不写；缺文件=全默认、坏 JSON 或非法字段=抛错带绝对路径与字段路径、数值越界=clamp | 照你自己项目的分法，出错要看得见 | 键表见 `docs/CONFIG.md` |
| 命令：`/todos`（清单）/ `clear` / `export` / `import <文件>` | `export` 吐 markdown、`import` 只吃 markdown checklist，闭环 | 你拍板 |
| 命令输出渠道一律 `ctx.ui.notify` | `sendMessage` 会进模型上下文（每轮付 token），`ctx.ui.custom` 在 RPC / print 下拿不到 | `dist/modes/interactive/interactive-mode.js:3115-3133` |
| TUI 文案全英文、简短直白；模型侧文案也是英文 | 你拍板 | 定稿在 `prompt/my prompt new/`（不入仓库），T6 搬进 `index.ts` |
| 模型侧指引：description + guidelines + 参数 schema；字符数已对定稿核对（description 37 字符、guidelines 2 条 146 字符 / 占位符替成 `todo` 后 136、签名一行 118 字符），≈ 74 tok 是旧稿实测，T6 按定稿复测；`promptSnippet` 留空 | guidelines 每轮都付；snippet 在 `codemode.mode: "only"` 下根本不渲染（它只渲染成工具清单里 `- todo: …` 那行，而 only 模式会把 direct 工具的声明剥掉）；没有 id / action 就没有协议要教 | `dist/core/system-prompt.js:85`、`dist/extensions/codemode/tool.js` 的 `prepareCodemodeLoadout` 与 `toCodemodeDeclaration` |
| 声明 `executionMode: "sequential"` | 排除并发写互相覆盖 | — |
| 不做 nudge | 中途改 systemPrompt 前缀会打掉 provider 的缓存前缀；且催收会把没验完的标成 completed，假完成比陈旧更坏 | `docs/extensions.md:189` |
| 不做项目级持久化 | 跨天的清单归仓库里的 `TODO.md`，模型自己能读写 | — |
| 不做 i18n、自定义 `renderResult`、`prepareArguments` 容错、status line | 现在没这个需求，加了就是长肉 | — |
| 工程：pnpm + vitest + `tsc --noEmit`；CI 走 ubuntu Node 22/24 与 windows Node 22 三个 job；发布走 npm 可信发布（OIDC） | 照 pi-web-search-lite | `~/Desktop/test/pi-web-search-lite/.github/workflows/` |
| 元数据：`0.1.0`、MIT、author setwhite；宿主包只进 `peerDependencies` 且范围写 `*` | pi 的扩展包必须这样声明 | `docs/packages.md` |

### 三处展开说

**协议为什么用整表快照，不用 add / update / toggle + 数字 id。**
头号失败模式是「陈旧计划」：模型建了表，干活时忘了更新，widget 一直在骗人。根因是更新一次要付一次完整往返 —— 动作式里「任务 1 完成 + 任务 2 开工」是两次调用。整表把它压成一次。顺带消掉两类错误：没有 id，就没有删完之后的 id 漂移；没有 key，就不必在 prompt 里教怎么起名，而**那部分 guideline 是每轮都要付的**。代价是每次重发任务文本（20 项约多 200 输出 token），只在调用时付，认。

**状态为什么只写自己的账。**
你本机是 `codemode.mode: "only"`，模型不会直接调 `todo`，而是写脚本调 `tools.todo()` —— 嵌套调用**不写 transcript 条目**（`docs/extensions.md:149`），流水账里根本没有那条 toolResult。rpiv 的解法是每次变化额外 `appendEntry` 写一条自己的账（`rpiv/todo.ts:83-87`），我们照做，并且**反过来不再往 toolResult 的 details 里写状态**：只有一条写入路径、只有一个读取路径，就不存在两边不一致。回放只扫 custom 条目。

**为什么不做 nudge。**
做法是在 `agent_settled` 时若有未完成项，下一轮 `before_agent_start` 往 systemPrompt 里塞一句提醒。两个问题：一是打断 prompt 前缀，provider 会走完整 transcript checkpoint（`docs/extensions.md:189`）；二是提醒的方向是「让表看起来干净」，模型被催时最省力的路径是把没验完的标成 completed —— 屏幕上出现一张过于乐观的表，比陈旧更坏。陈旧至少还把 `in_progress` 摆在那儿。替代方案是一条 guideline「完成即标，别攒着」。

## 工具契约

`todo(tasks)`，一次调用提交完整有序清单。

| 字段 | 必填 | 约束 |
|---|---|---|
| `tasks` | 是 | 数组，≤ 20 项；顺序即显示顺序；`[]` 表示清空 |
| `tasks[].content` | 是 | trim 后非空，≤ 120 字符（code point 计，emoji 算 1） |
| `tasks[].status` | 是 | `pending` \| `in_progress` \| `completed`；不做 `deleted`（删 = 不出现在表里） |

- 全有或全无：任一项不合规就报错，状态一动不动，模型重写。
- 未知键直接拒绝：`{tasks, action}` 或项里带 `id` / `activeForm` 都报错，不静默剥离 —— rpiv 那套 12 字段的协议混进来会被点名。
- 「正在做」**不设条数上限**（你拍板），并行开几条都行，表头的 `· N doing` 就是它的表达方式。
- 返回值：文本 = 完整清单（`[ ]` / `[-]` / `[x]` 前缀）+ 一行进度，供模型自查。
- 状态落盘只走 `pi.appendEntry`，与返回值无关。
- 参数 schema 里不写字段文案、不加数值约束：pi 渲染时只要带文案或约束，签名就从一行炸成多行（实测 88 → 194 字符、一行 → 七行）；三个字段全必填；不声明 `outputSchema`（走 codemode 默认的字符串类型）。
- 上限数字（120 字符 / 20 条）不写进模型侧文案 —— 它会跟 `config.json` 脱钩，改了配置文案就成了假话；真被拦下时由报错消息带出真实上限。

## 代码结构

| 文件 | 职责 | 依赖 |
|---|---|---|
| `index.ts` | 读配置、注册工具 / 命令 / 事件、调 `setWidget` 与 `appendEntry`；唯一 import pi 的地方 | plan、view、config |
| `plan.ts` | 类型、校验、回放（从 entries 里取最后一条有效快照） | 无 |
| `view.ts` | 表头与条目行、按列宽截断、`/todos` 文本、markdown 导出与导入解析 | plan（只取类型） |
| `config.ts` | 读 `config.json`、默认值、校验、clamp | `node:fs` |

依赖只能从左向右。`plan.ts` / `view.ts` / `config.ts` 都不 import pi 的包，这样测试不用 mock 宿主。

## 阶段划分

- **M1（MVP）**：工具 + 校验 + `appendEntry` 写账 + 回放 + widget（表头与条目、截断、溢出）+ 配置骨架 + 模型侧文案。做完这一阶段就能替掉本机的 lean 版。
- **M2**：`/todos` 四个子命令、折叠键 `alt+t`、配置补到键表全量。
- **M3（发布）**：`package.json` / `tsconfig.json` / LICENSE / 中英 README、vitest 用例补齐、CI 与 npm 发布两个 workflow。

## 不做项

项目级持久化（跨会话 / 跨 cwd 的存储）；nudge 与 steer；auto-clear；status line；自定义 `renderCall` / `renderResult`；子代理看板；`key` / `baseVersion`；i18n；`prepareArguments` 容错层；日志与调试开关；压缩后忘表的兜底（表只活在模型上下文里，被 compaction 截掉后模型不知道表内容、widget 却还在显示 —— 先不做，等真观察到症状再议）。这份清单是契约，要加得先改 PLAN。

## 验收标准

以脚本用例为主（你拍板），真机跑一次作补充。

| | 验收 |
|---|---|
| AC1 | `plan.ts` 校验用例：空 content、121 字符、21 项、非法 status、非数组 —— 全部拒绝，且状态不变 |
| AC2 | 回放用例：一串 entries（中间混入坏条目）取到最后一条有效快照；一条都没有时是空表 |
| AC3 | 渲染用例：0 / 1 / 20 条 × 终端宽度 40 / 80 / 120 —— 行数、`…` 截断、`+N more` 都符合预期 |
| AC4 | 真机：`pi -e ./index.ts` 起一个 ≥ 3 步的任务，表出现在输入框上方；`/todos` 打出清单；模型传 `tasks: []` 后 widget 消失 |
| AC5 | `/todos export` 吐出的 markdown 能被 `/todos import` 原样读回 |
| AC6 | 模型侧开销 ≤ 120 tok：description + guidelines + `describeTool("todo")` 渲染出的那一行签名（旧稿实测 ≈ 74，T6 按定稿复测） |
| AC7 | 干净克隆上 `pnpm typecheck && pnpm test` 通过；CI 三个 job 绿 |

## 影响范围

- 装上之前要卸掉 `@ssk_dev/rpiv-todo-lean`（两个都注册 `todo`）；开发期怎么处理还没定。
- 不动 `settings.json`；除 `/todos import|export` 显式指定外不读项目内文件。
- 回退：卸包、装回 lean 版，会话里已经写下的 `pi-todo-state` 条目留着不影响任何东西。

## 待定（不挡开工）

- 模型侧文案：**定稿在 `prompt/my prompt new/`**（description / snippet / guidelines / schema，2026-10-16 你定），后续按实测数据再调；`prompt/my prompt old/` 是上一稿，`prompt/` 五个 md 是对照稿（上游 rpiv 原文 + 中文对照）。整个 `prompt/` 是你在本机的对比素材 —— 不进仓库（`.gitignore`）、不进 npm 包。
- 与本机 lean 撞名的处理方式（你说留到开发时定）。
- 实测（开发后，你说先不急）：模型拿到现在这两行 guideline 会不会整表重发；不会的话再补一句或改协议。
