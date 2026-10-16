# TODO — pi-todo-lite

> 状态：待批准
> 任务按开发顺序排，每条单次会话可完成。验收编号见 `docs/PLAN.md` 的「验收标准」；「验收证据指针」由 coding 边做边填。

## M1 · MVP

- [x] T1 仓库骨架
  - 交付物：`package.json`（`name: pi-todo-lite`、`type: "module"`、`pi.extensions: ["./index.ts"]`、scripts `test` / `typecheck`、`files` 白名单、`peerDependencies` 四个宿主包范围写 `*`）、`tsconfig.json`（strict + `noEmit`）。`.gitignore` 已就位（`node_modules/`、`prompt/`）
  - 依赖（devDependencies）：`vitest`、`typescript`、`@types/node`、`@earendil-works/pi-coding-agent`、`@earendil-works/pi-tui`、`typebox`；`dependencies` 保持为空
  - 验收：
    - AC1 `pnpm install` 成功，`pnpm typecheck`、`pnpm test` 都能跑（此时可以零用例）
    - AC2 锁文件入库，`node_modules/` 不入库
  - 验收证据指针：
    - AC1 `package.json`（`typecheck` = `tsc --noEmit`、`test` = `vitest run --passWithNoTests`、`packageManager: pnpm@12.3.4`）；实跑 node v26.7.0：`pnpm install` exit 0、`pnpm install --frozen-lockfile` exit 0、`pnpm typecheck` exit 0、`pnpm test` exit 0（0 用例）
    - AC1 两处偏差：tsc 零 TS 输入报 TS18003，故 `index.ts` 先落占位（T6 填实）；`pi.extensions` 取字符串数组 —— 宿主只接受数组（`@earendil-works/pi-coding-agent/dist/core/pi-manifest.js:16`）
    - AC2 `pnpm-lock.yaml` 随 T1 提交入库；`pnpm-workspace.yaml` 两段：`allowBuilds` 手工 deny `@google/genai` / `protobufjs`（默认会报 `ERR_PNPM_IGNORED_BUILDS`）、`minimumReleaseAgeExclude` 11 条由 pnpm 12 自动写入（删掉后 `pnpm install --frozen-lockfile` 报 `ERR_PNPM_MINIMUM_RELEASE_AGE_VIOLATION`）
    - AC2 `git check-ignore -v node_modules` → `.gitignore:1:node_modules/`
  - 前置：无

- [x] T2 config.ts
  - 交付物：`config.ts`（21 键的类型、默认值、校验、clamp）、`test/config.test.ts`
  - 验收：
    - AC1 文件不存在 → 全默认值，不报错
    - AC2 坏 JSON / 未知键 / 类型错 / 枚举错 → 抛 `Error`，消息含绝对路径与 `<字段路径>: <原因>`，多条一次列完
    - AC3 数值越界 clamp 到区间，不报错
    - AC4 路径优先级：入参 `configPath` > `$PI_CODING_AGENT_DIR` > `~/.pi/agent`
  - 验收证据指针：
    - AC1 `test/config.test.ts`：`配置文件缺失时全部取默认值，不报错` / `部分字段缺省时其余沿用默认值，嵌套对象逐键合并` / `每次返回独立对象，改返回值不动 DEFAULTS`
    - AC2 用例：`JSON 损坏：报绝对路径与 invalid JSON` / `顶层不是对象：报 expected object, got <值>` / `对象位置放数组或标量：报字段路径 + expected object` / `未知键在任意层级都报完整字段路径` / `类型错按 expected <类型>, got <值> 报，字符串带回引号` / `布尔与非整数都按类型错拒绝` / `枚举错列出全部合法值` / `工具名不合法时代码报字段路径` / `字符串数组逐元素报下标` / `超长字符串在报错里被截断，不回显全文` / `多处错误一次列完，不半途而废`（4 条错误的顺序也断言了）
    - AC3 用例：`数值越界 clamp 到上界，不报错`（500→200、1000→400、50→10）/ `数值越界 clamp 到下界，不报错`（0→1、1→3）/ `区间内的数值原样保留`
    - AC4 用例：`configPath 优先于 $PI_CODING_AGENT_DIR`（9 赢 7）/ `$PI_CODING_AGENT_DIR 优先于 ~/.pi/agent`（读到 7）/ `都没有时落到 ~/.pi/agent/pi-todo/config.json`（走 `resolveConfigPath`）/ `$PI_CODING_AGENT_DIR 是相对路径时按 cwd 解析成绝对路径` / `$PI_CODING_AGENT_DIR 指向的目录没有配置文件时取默认值`
    - 契约新增两个导出：`DEFAULTS`、`resolveConfigPath`（home 分支不起文件才可测），契约与取舍已同步 `docs/modules/config.md`；多条错误用 `\n` 连接（首条带 `pi-todo config <路径>:` 前缀），非整数按类型错拒绝，部分对象逐键与默认值合并
    - audit 追修（两条）：`resolveConfigPath` 对 `$PI_CODING_AGENT_DIR` 也走 `resolve()`，相对 env 的错误消息实测为绝对路径；`docs/PLAN.md:39,107`、`docs/CONFIG.md:67,69` 的 description 字符数 39 → 37（`config.ts` 于 `prompt/my prompt new/description.md` 正文逐字一致，实测 37），guidelines 标成「占位符 146 / 替成 `todo` 后 136」；`describe()` 对容器只说形状、对 32 字符以上字符串截断（T3 audit 追修同款，`test/config.test.ts` 的 `超长字符串在报错里被截断，不回显全文` 覆盖，含代理对的切法 —— 向量在清理时从 😀 换成生僻汉字 𠀋）
  - 前置：T1

- [x] T3 plan.ts 校验
  - 交付物：`plan.ts` 的 `Status` / `Task` / `validateTasks`、`test/plan.test.ts`
  - 验收：
    - AC1 空 content、121 字符、21 项、非法 status、`tasks` 非数组 —— 全部拒绝且抛 `Error`（PLAN AC1）
    - AC2 报错消息带第几条与真实上限（`todo: task 3: content is 128 chars, max is 120`）
    - AC3 返回 trim 过的新数组，不改入参
  - 验收证据指针：
    - AC1 `test/plan.test.ts`：`空 content 被拒绝` / `超长 content 被拒绝，报 trim 后的长度与真实上限`（121 字符 + 上限改 10 时的 11 字符）/ `超过条数上限被拒绝，报真实上限`（21/20 与 6/5）/ `非法 status 被拒绝`（`"done"`、`5`、缺字段）/ `content 不是字符串被拒绝` / `item 不是对象被拒绝` / `tasks 不是数组被拒绝`（`3`、`"a"`、缺字段）/ `入参不是对象被拒绝`（`null`、数组）/ `未知键被拒绝，不静默剥离`（顶层 `action` 报 `unknown key "action"`、项内 `id` / `activeForm`，含顶层+项内混排的三行消息与 `{tasks: 3, action: "add"}` 的两行消息）/ `长度按 code point 计，emoji 算 1 个`（120 个 😀 = 240 UTF-16 units 通过，121 个报 `content is 121 chars, max is 120`）/ `content 里的控制字符被拒绝，要求单行`（`\n` / `\t` / ESC / U+2028 各一条，消息按类给名 + U+ 码点）/ `content 同时含控制字符又超长时两条都报`（201 字符含内部换行）/ `不可见格式字符被拒绝：RLO / ZWSP / 软连字符 / BOM`（U+202E、U+200B、U+00AD、U+202A 各一条，消息一律 `an invisible character (U+…)`；U+FEFF 夹在中间，首尾的归 `trim()`）；拒绝即 `Error`，无部分应用，且用例断言入参未被改动
    - AC2 `报错带第几条：第三条超长就是 task 3` → 逐字 `todo: task 3: content is 128 chars, max is 120`（TODO/`docs/modules/plan.md` 的示例）；`多条违规一次列完，每条都带工具名前缀`（两条错误、顺序与全文都断言）；`前缀取工具名，不写死 todo`（`toolName: "plan"` 时消息以 `plan: ` 开头且不含 `todo`）；`超长字符串在报错里被截断，不回显全文`（`tasks: "z".repeat(5000)` → 消息 < 100 字符）/ `截断按 code point 切，不切出半个代理对`（`"a" + 𠀋×20` 不足 32 字符不截，𠀋×40 截在 31 个字符处 —— U+2000B 是拓展 B 区汉字，同样占 2 个 UTF-16 unit）
    - AC3 `返回 trim 过的新数组，不改入参`（数组与元素都不是同一引用、入参 content 仍带空格）/ `空表合法，返回空数组` / `trim 后正好等于上限算合法`
    - 契约改动（记偏差）：第二参由 `limits: { maxTasks, maxContentChars }` 改为 `options: ValidateOptions`，多一个 `toolName` —— 宿主不会替工具错误加工具名前缀，`createErrorToolResult(error.message)` 原样回给模型，T3-AC2 的示例消息却带 `todo:`，所以前缀只能由配置里的工具名生成；契约已同步 `docs/modules/plan.md`
    - 顺带改动（记偏差）：`describe()` 对容器改为只说形状（`array of 21`、`object with keys a, b`），不再 `JSON.stringify` 回显正文 —— 否则 20 项任务表会被原样拼进错误消息；`config.ts` 用同款实现，`test/config.test.ts` 的一条期望随之改为 `plan: expected object, got array of 0`（用例名不变）
    - audit 追修（三条）：`describe()` 的字符串分支也加了 32 字符截断（内容说形状后字符串成唯一漏洞，`config.ts` 同步、新增用例 `超长字符串在报错里被截断，不回显全文`）；长度口径定为 **Unicode code point**（`Array.from(content).length`），并把口径写进 `docs/PLAN.md:28,36`、`docs/CONFIG.md:23`、`docs/modules/plan.md`；未知键在顶层与项内都拒绝，不再静默剥离（消息 `unknown key "<键>"`，用引号区分路径式写法，顺序固定在项数之前/项内最后）
    - audit 三轮（由 T4 审计牵出）：content 单行规则落进 `readContent` —— 命中 `\p{Cc}` / `\p{Zl}` / `\p{Zp}`（\n、\t、ESC、U+2028）报 `content has a control character (U+000A); keep it one line`；同一字段的多个问题（控制字符 + 超长）现在两条都报。规则已同步 `docs/PLAN.md`、`docs/CONFIG.md`、`docs/modules/plan.md`
    - audit 四轮（两条，收口）：① `\p{Cf}` 从「整类放行」改成整类拒绝 —— RLO / ZWSP / 软连字符 / BOM 都进拒绝集（消息尾部按类分「keep it one line」/「keep it plain text」），不做 ZWJ / ZWNJ / 变体选择符白名单，理由：这里是纯文本，单码点 emoji（😀）本就不含 `\p{Cf}`，组字 emoji 与 VS16 被拒后模型改写即可；② 回放侧转义序列整条丢（CSI / OSC / 单字符 Fe），不再留 `[31m` 残渣
    - 过度设计清理（用户裁定）：删掉 `plan.ts` 里 9 条字符名对照表（`CHARACTER_NAMES`），报错只按类给名 + U+ 码点；测试里「截断」的向量从 😀 换成生僻汉字 𠀋（`test/plan.test.ts`、`test/config.test.ts`）。保留未动的两处：`ESCAPE_SEQUENCE` 的 OSC / Fe 分支、`docs/TODO.md` 的逐轮审计流水
    - audit 重审（三条）：`echo()` 改按 code point 切（`Array.from` + `slice` 后 `join`），不再可能切出孤立代理对，`config.ts` 同款；`tasks` 不是数组并入 reasons 列表、不再单行早退（`{tasks: 3, action: "add"}` 一次报两条，模型不必等下一轮）；AC 归类改正 —— code point / emoji 那条从 AC3 移回 AC1
  - 前置：T1

- [x] T4 plan.ts 回放与文本
  - 交付物：`replayTasks`、`formatTasks`、`test/plan.test.ts` 续
  - 验收：
    - AC1 一串 entries（中间混入坏条目）取到最后一条有效快照；一条都没有 → `[]`（PLAN AC2）
    - AC2 只认 `type: "custom"` + `customType: "pi-todo-state"`，不读 toolResult 的 details
    - AC3 `formatTasks` 空表 → `Todo 0/0`；非空 → 一行进度 + 每项一行带 `[ ]` / `[-]` / `[x]`
  - 验收证据指针：
    - AC1 `test/plan.test.ts`：`取最后一条有效快照`（3 条 entries，取第三条、且不是同一引用）/ `坏快照跳过，继续往前扫`（6 种坏形状：缺 `data`、`data: null`、`tasks: "x"`、status 非法、content trim 后为空、项是字符串）/ `一条快照都没有时是空表`（`[]` 与只有别的 customType）/ `快照里多余字段丢掉，content trim 后带出` / `快照里的控制字符压成空格，不丢整表`（`line1\nline2\t` → `line1 line2`）/ `快照里的转义序列整条丢掉，不留 [31m 残渣`（CSI + NUL → `red x`、OSC 超链接 → `link`、RLO 压平）；条目形态取自宿主 `CustomEntry { type: "custom"; customType; data? }`（`dist/core/session-manager.d.ts:80-84`）
    - AC2 `只认 type: custom + customType: pi-todo-state，不读 toolResult 的 details`：三个诱饵（`{type:"message", role:"toolResult", details:{tasks}}`、`{type:"custom_message", customType:"pi-todo-state", details:{tasks}}`、customType 近似的 `pi-todo-state-extra`）单独回放都是空表；真快照排在最前时回放真快照
    - AC3 `空表只给一行 Todo 0/0` / `非空表：一行进度 + 每项一行带字形`（三态各一行，逐字 `Todo 1/3 · 1 doing` + `[ ] write tests` + `[-] implement` + `[x] ship`）/ `doing 为 0 时省略 · N doing`（`Todo 1/2`）
    - audit 一轮（一条）：content 里的 `\n` 把「每项一行」打成多行（1 条任务出 3 行、第二行没字形），`\t` 与 ANSI 也原样进文本，而 T4-AC3 的形状与 T5-AC1 的行数预算都建立在一项一行上 —— 规则没有加在渲染侧，而是落在数据入口：`validateTasks` 拒绝控制字符（模型能重写），`replayTasks` 整条丢弃转义序列、其余压成空格（旧账不整表消失），`Task.content` 单行无控制字符与不可见字符成为不变量（详见 T3 的 audit 三轮、四轮）
    - 口径记录：`replayTasks` 对 content 也 trim，保住「`Task.content` 一律 trim 过」的不变量；`formatTasks` 的进度行 `Todo {done}/{total} · {doing} doing`（doing 为 0 时省略后半段）与 `view.ts` 表头同规则，但 view 按契约只从 plan.ts 取类型、自己实现模板 —— 是同规则的两份拷贝，不是共享函数
  - 前置：T3

- [x] T5 view.ts widget 行
  - 交付物：`renderWidget`、`test/view.test.ts`
  - 验收：
    - AC1 0 / 1 / 20 条 × 宽度 40 / 80 / 120：行数、`…` 截断、`+N more` 都符合预期（PLAN AC3）
    - AC2 空表返回 `undefined`；表头 `{doing}` 为 0 时省略 `· … doing`
    - AC3 超出行预算时先整条丢 completed，再砍非完成项的尾巴
  - 验收证据指针：
    - AC1 `test/view.test.ts`：`20 条 × 宽度 40 / 80 / 120：行数卡在 maxLines 内，末尾是 +N more`（9 行、每行 ≤ width、末行 `+13 more`、第 2 行 `[ ] task 1`）/ `放不下的行按 code point 截断，省略号是 …`（60 字符 content @40 → 逐字 `[ ] ` + 35 个 x + `…`，整行 40 字符）/ `截断不切出半个代理对`（`𠀋×40` @40 → 40 个 code point、无孤立代理字符）/ `表头也按宽度截断`（@5 → `Todo…`）/ `宽度为 0 时给空行，不抛错` / `正好装满预算时不出 +N more`（`maxLines 21` 装 20 条不出汇总，21 条才出 `+2 more`）/ `maxLines 为 3 时只剩表头 + 一行 + 汇总`（逐字 `Todo 0/20`、`[ ] task 1`、`+19 more`）
    - AC2 `空表返回 undefined，widget 消失`；表头两条：`doing 不为 0 时表头带 · N doing，为 0 时整段省略`（`Todo 1/3 · 1 doing` / `Todo 0/3`）、`表头模板替换三个占位符，认不出的占位符当普通文本`（`{done}/{total} 完成 · {doing} 进行中 ({nope})` → `1/2 完成 ({nope})`，doing 为 0 时删「占位符 + 前邻 · + 后邻一个词」）
    - AC3 `超预算先整条丢 completed`（3 completed + 1 pending @`maxLines 4` → 逐字 `Todo 3/4`、`[ ] 还剩这件`、`+3 more`）/ `非完成项也超预算时砍尾巴，隐藏数把 completed 一起算上`（8 completed + 20 pending @9 行 → 9 行、`+21 more`、无 `[x]` 行）/ `showCompleted 为 false 时 completed 只进表头计数`（`Todo 1/2` + `[ ] todo`）/ `字形取配置里的三态符号`
    - 口径记录：`width` 与长度都按 code point 数（与 `plan.ts` 的 `countChars` 同一套，不做 East Asian width，`width` ≤ 0 给空行）；`+N more` 的 N 含被丢掉的 completed（`showCompleted: false` 时 completed 本就不列，故不计入）、汇总行自己占一格（溢出时条目最多 `maxLines - 2` 行）；溢出**不**用 completed 回填空位（rpiv 会回填，我们按 PLAN 的「先整条丢 completed」）；计数永远按整张表算，`showCompleted: false` 只影响条目行
    - 本轮只落 `renderWidget`：`renderList`（T8）、`toMarkdown` / `parseChecklist`（T9 / T10）按 TODO 留在各自任务里，`docs/modules/view.md` 的契约块已登记
    - audit 一轮（两条）：① 模板里出现多个 `{doing}` 时原来只处理第一个（`"{doing} doing · {doing} doing"` + doing 0 → `Todo 0/2 · 0 doing`），改成逐个按同一套删（`renderHeader` 重扫，删不出新占位符所以收敛），新增用例 `模板里有多个 {doing} 时每个都按同一套处理`；② `maxLines: 1` 时原来吐 2 行（表头 + `+N more`）破了「`maxLines` 是总行数」的表述，`renderWidget` 给汇总行加 `budget > 0` 条件（预算连表头都装不下就只剩表头），新增用例 `maxLines 为 1 时只剩表头，汇总行也不出`（`maxLines 2` → 表头 + `+2 more`）；`maxLines` 低于 2 在真实配置里不可达（`config.ts` clamp 3–10）
  - 前置：T3

- [x] T6 index.ts 接线
  - 交付物：`index.ts`（读配置 → 注册工具、三个会话事件 → `appendEntry` → `setWidget` 组件工厂）；模型侧文案从 `prompt/my prompt new/` 搬入，`tool-name:` 替成配置里的真实工具名
  - 验收：
    - AC1 工具名取 `tools.todo.name`；description / guidelines / schema 与定稿逐字一致（可脚本比对）
    - AC2 一次调用后 `getBranch()` 里出现一条 `pi-todo-state`，`data.tasks` 与入参一致
    - AC3 三个事件从空 entries 回放都不抛错
  - 验收证据指针：
    - AC1 `test/index.test.ts`：`工具名取 tools.todo.name，sequential，label 是 Todo`（name `tasklist` 生效）/ `description / guidelines / schema 与定稿逐字一致`（description 逐字 `Keep a todo list for multi-step work.`、guidelines 逐字两条带 `todo: ` 前缀、`promptSnippet` 是 `undefined`、schema 与字面 JSON 逐字相等）/ `guidelines 里的 tool-name: 替成配置里的工具名`（`tasklist: Keep content short, one line, imperative.`）/ `description 与 guidelines 跟着配置走`（自定义 description 与 guidelines，`tool-name` 仍被替换）；**脚本比对定稿**（`prompt/my prompt new/` 现读现比）：description 逐字 true、37 字符，guidelines 逐字 true，占位版 146 字符 → 替成 `todo` 后 **136 字符**（对上 PLAN AC6 的定稿数）、2 条，`promptSnippet` 与 snippet.md 一样是空；`一条 guideline 里写了多次 tool-name 时每处都替换`（`tool-name: a tool-name note` → `todo: a todo note`，旧实现只替第一处）/ `模型侧文案对得上 PLAN AC6 的定稿数：description 37 字符、guidelines 合计 136 字符`。**仓库内可复现的锚点是 `config.ts` 的 `DEFAULTS` + 这些用例的字面量与字符数**（干净克隆上 `pnpm test` 就能跑）；`prompt/my prompt new/` 的现读现比属于**本机一次性核对**（`prompt/` 被 `.gitignore` 忽略、不在版本控制里，干净克隆/CI 上复现不了）
    - AC2 `test/index.test.ts`：`appendEntry 出一条 pi-todo-state，data.tasks 是校验后的 tasks（content 已 trim），返回值是 formatTasks 的文本`（entries 逐字 `{type:"custom", customType:"pi-todo-state", data:{tasks:[…]}}`、返回 `Todo 0/1\n[ ] a`；"与入参一致"是校验后的一致：传 `content: "  a  "` 时 entry 里存的是 trim 过的 `"a"`，不是原始入参逐字）/ `校验失败：抛出错误、不写 entry、不重画`（`todo: task 1: content is empty`，entries 空、requestRender 0 次）/ `tasks: [] 清空表：entry 里是空表，widget 渲染成空` / `状态变化后重画一次 widget`（requestRender 恰好 1 次）
    - AC3 `test/index.test.ts`：`三个事件从空 entries 回放都不抛错`（三个事件各设一次 widget，渲染 `[]`）/ `回放最后一条快照：session_tree 之后 widget 显示旧任务，placement 取配置`（`Todo 1/2` / `[ ] a` / `[x] b`，`{placement:"belowEditor"}`）/ `widget.enabled 为 false 时不注册 widget，工具照常注册` / `没有 UI（hasUI 为 false 或缺 setWidget）时静默跳过`
    - 口径记录：接线单测用 **fake api + fake ctx**（`registerTool` / `on` / `appendEntry` / `ui.setWidget` / `sessionManager.getBranch` 五样），只断言我们交给 pi 的东西 —— pi 自己的 schema 校验、事件顺序、widget 渲染不在测试范围（真机 T7）；`appendEntry` 的 `customType` 用 `plan.ts` 新导出的 `STATE_CUSTOM_TYPE`（plan.ts 原来只私有，T6 起是契约的一部分）；`execute` 的 `details` 留空（状态只写 custom entry，回放不读 toolResult details）；`label` 文档没写，取 `"Todo"`
    - 偏差：① `prompt/my prompt new/schema.md` 的定稿片段没有 `additionalProperties: false`，实现按 `docs/modules/plan.md:27` 内外层都加了（脚本比对因此只能对字段形状，不对整段文本）；② `docs/modules/index.md` 原写「description / guidelines / 参数 schema 直接写在这个文件里」，实现改成 description / guidelines 从 `config.guidance.*` 取（`DEFAULTS` 里就是定稿正文，否则 T2 的 guidance 三个键没有消费者），模块文档同步改成现在这句；③ 模块文档原写「接线不写单测」，T6 的 AC1–AC3 要证据指针，改成 fake harness 测（真机留给 T7）
    - PLAN AC6 复测（定稿，按宿主自己的估算器算）：description 37 + guidelines 137（= 两条逐字相加 136 + 行间 1 个换行）+ 签名一行 144 = **318 字符** → pi-ai 的 `estimateTextTokens`（`CHARS_PER_TOKEN = 3.5`，`pi-ai/dist/utils/estimate.js:2,23`，即 `ceil(字符数 / 3.5)`）**91 tok**；codemode 自己的 inline 预算口径（4 字符/token，`pi-coding-agent/dist/extensions/codemode/tool.js:68,135`）80 tok —— 两套都 ≤ 120。**模型真正看到的那一段**（`### \`todo\`` 标题含换行 11 字符 + `renderToolSample` 输出 363 字符，含收尾的换行与代码围栏）= 374 字符 → 107 tok（3.5）/ 94 tok（4）；只算到代码块内容结束（去掉收尾 4 字符）是 370。签名一行逐字：`declare const tools: { todo(args: { tasks: Array<{ content: string; status: "pending" | "in_progress" | "completed"; }>; }): Promise<string>; };` —— `additionalProperties: false` 不进签名（`schemaToType` 不看它），所以加它零字符成本
    - audit 一轮（四条）：① token 数改用宿主估算器的口径（3.5 字符/token）并注明 codemode 自己的 4 字符/token 预算口径；② 更正「codemode 整段」的长度定义（374 = 标题 11 + sample 363）并说明 370 的切法；③ 占位符从 `replace` 改成 `replaceAll`（一条 guideline 写多次只替第一处）+ 用例；④ AC1 证据改成「仓库内锚点 = `DEFAULTS` + 测试字面量」，`prompt/` 比对降级为本机一次性核对；另把 AC2 证据里的「与入参一致」写明是校验后的一致（content 已 trim）
  - 前置：T2、T4、T5

- [x] T7 真机验收
  - 交付物：一次实跑记录（命令、任务、观察到的 widget 与工具返回值）；发现问题回改对应模块
  - 验收：`pi -e ./index.ts` 起一个 ≥ 3 步任务：表出现在输入框上方；`/todos` 打出清单；模型传 `tasks: []` 后 widget 消失（PLAN AC4）
  - 风险：本机安装的 `@ssk_dev/rpiv-todo-lean` 也注册 `todo` —— 跑之前先卸掉它，或临时把 `tools.todo.name` 改成别的
  - 验收证据指针：
    - AC4 真机跑了三次，命令与观察逐条如下（三次都在 `-ne -e ./index.ts` 下：装好的九个扩展全关，绕开 rpiv-todo-lean 抢 `todo`）
      - ① 登记（headless）：`pi -ne -e ./index.ts -t todo --session-dir <tmp>/sessions -p "帮我规划三步：①读 config.ts ②跑测试 ③写文档。请先用 todo 工具把这个计划登记上去（第一步 in_progress，其余 pending），然后只回一句「已登记」"` —— 会话第 5 条是 toolCall `todo`，参数逐字 `{"tasks":[{"content":"读 config.ts","status":"in_progress"},{"content":"跑测试","status":"pending"},{"content":"写文档","status":"pending"}]}`；第 6 条是 custom `pi-todo-state`，data 同内容；工具返回逐字 `Todo 0/3 · 1 doing\n[-] 读 config.ts\n[ ] 跑测试\n[ ] 写文档`（= `formatTasks` 输出）；模型答「已登记」
      - ② 清空（同一会话 `--session <file>`）：toolCall `{"tasks":[]}` → 第 11 条 custom `{"tasks":[]}` → 返回逐字 `Todo 0/0`
      - ③ 真机 TUI（伪终端 + 脚本化按键，用来验「表出现在输入框上方」与「清空后消失」）：`{ sleep 4; printf '用 todo 工具登记三步计划：读 config.ts、跑测试、写文档，第一步 in_progress；不要执行步骤\r'; sleep 45; printf '现在把清单清空：调用 todo 工具，tasks 传空数组 []。\r'; sleep 30; printf '/exit\r'; sleep 6; } | winpty -Xallow-non-tty pi -ne -e ./index.ts -t todo --tui-mode regular --session-dir <tmp>/tui-clear > tui-clear.log` —— 剥掉 ANSI 后 1125 行，widget 四行 `Todo 0/3 · 1 doing` / `[-] 读 config.ts` / `[ ] 跑测试` / `[ ] 写文档` 出现在第 212…662 行（含首次出现的帧 661-665：` todo` 调用行 → widget 四行 → 分隔线与状态行），**第 662 行之后到进程结束的 462 行里这四行不再出现** → 清空后 widget 消失；工具调用显示行 `todo tasks=[{…}]`、`todo tasks=[]` 各一次；模型答「会话结束。todo 清单已清空，未执行任何步骤。」
      - 「输入框上方」的落地依据（宿主代码，不是我们的断言）：`config.ts:48` 默认 `ui.widget.placement = "aboveEditor"`，交给宿主的是 `ctx.ui.setWidget("todo", factory, { placement })`；宿主的布局挂载顺序是 `modes/interactive/interactive-mode.js:691-699` = document → pendingMessages → status → **widgetContainerAbove** → **editorContainer** → widgetsBelow → footer，`setExtensionWidget` 按 `options?.placement ?? "aboveEditor"`（同文件 1854）把组件塞进 above/below 两个容器之一（1934-1940 `renderWidgets`/`renderWidgetContainer`）
    - 口径记录：headless（`-p`）下 `ctx.hasUI` 为 false，`draw()` 按设计静默跳过，所以 widget 只能靠真 TUI 验——③ 用 `winpty -Xallow-non-tty` 抓真实终端输出（本机无 tmux）；`--tui-mode regular` 只是让帧落进滚动缓冲便于 grep，用户日常的 `fullscreen` 与它共用同一段 widget 容器装配；`-t todo` 把工具白名单收到我们的工具，模型没有执行步骤的机会（三次跑下来工具调用只有 `todo`）；`--session-dir` 指到临时目录，没往 `~/.pi/agent/sessions` 写会话；`winpty` 报的退出码 58 是 `/exit` 之后 pi 进程的退出码，两次跑一致，不是扩展报错
    - 观察（非违规，记录备查）：① 宿主对自己的 widget 另有 `MAX_WIDGET_LINES = 10` 上限（`interactive-mode.js:1929` 定义、1871/1874 用，超了会追加 `... (widget truncated)`）——我们的 `maxLines` clamp 在 3–10，撞不到；② rpiv-todo-lean 2.13.10 依赖 `@juicesharp/rpiv-todo` 并注册 `todo`（`index.ts:394 todo(leanPi)`；名字来自 `@juicesharp/rpiv-todo/tool/types.ts:11 TOOL_NAME = "todo"`），还会用 Proxy 改写 `todo` 工具的 description / guidelines / schema（`index.ts:313-331`）——真实（不 `-ne`）环境里两个 `todo` 同名会撞上，本次全程 `-ne` 绕开；同一个包还注册 `/todos` 命令（`@juicesharp/rpiv-todo/index.ts:36`），M2 实现 `/todos` 时同样会撞名；③ RPC 模式文档写明「component factories are ignored」（`docs/rpc-extension-ui.md`），我们的 widget 正是工厂，RPC 下不渲染（TUI 不受影响）
    - 偏差：验收里的「`/todos` 打出清单」属 M2，本轮跑不了 —— 该子句由 T8 的 AC1 覆盖（同一条命令、同一观察），T7 只按 widget 出现/消失 + 工具返回值收（用户裁决：T7 直接勾）
  - 前置：T6

## M2 · 命令与配置收口

- [x] T8 /todos 骨架 + 清单 + clear
  - 交付物：命令注册、`renderList`、`/todos clear`
  - 验收：
    - AC1 `/todos` 全列清单（不截断、不省条目），走 `ctx.ui.notify`
    - AC2 `/todos clear` 后 widget 消失，会话里多一条空表账
    - AC3 `ctx.ui` 缺失（RPC / print）时不抛错
  - 验收证据指针：
    - AC1 `test/view.test.ts` 的 `renderList`（5 条）+ `test/index.test.ts` 的 `/todos：notify 出整张表，不截断不省条目（widget 仍按 maxLines 截断）`（20 条 × `maxLines: 3` → notify 21 行、widget 仍 3 行）、`注册命令 todos，带一句 description`
    - AC2 `test/index.test.ts` 的 `/todos clear：写一条空表账、widget 消失、notify 一句`（最后一条 entry 是 `{tasks: []}`、`lines(80)` 变 `[]`、notify 是 `Cleared`/info）
    - AC3 `test/index.test.ts` 的 `ctx.ui 缺失（print / JSON / RPC）时不抛错，状态照旧落账`（ui 只有 `{}` → `run("")` / `run("clear")` 都不抛、空表账照写）、`commands.todos.enabled 为 false 时不注册命令，工具与 widget 照常`、`不认识的子命令：warning 用法提示，不动状态`
    - 真机（T8–T10 共用一次 RPC 跑）：`pi --mode rpc -ne -e <仓库绝对路径>/index.ts -t todo`，stdin 逐条喂 `{"type":"prompt","message":…}`：登记三步 → `/todos` → `/todos export` → `/todos clear` → `/todos import <导出的文件名>` → `/todos`。stdout 的 `extension_ui_request`（notify）逐条：`Todo 0/3 · 1 doing` + 三行条目 → `Exported 3 tasks to …\todo-20261016-2342.md` → `Cleared` → `Imported 3 tasks from …` → `Todo 0/3` + 三行条目；106 行 RPC 输出里没有 `extension_error`、没有栈行
    - 口径记录：RPC 下 `ctx.hasUI` 其实是 true、`notify` 走 RPC 的 extension UI 协议（`docs/rpc-extension-ui.md`）；真正没有 `ctx.ui` 的是 print / JSON 模式（这两个模式也没有命令入口），所以 AC3 的「RPC」一半按「不抛错 + notify 送达」真机收，「print」一半按单测 + T7 的加载跑收
    - 偏差：命令名写死常量 `todos`（`index.ts:24`）—— 做成配置键会动 `docs/CONFIG.md` 冻结的 21 键与 `docs/PLAN.md` 的「不做项」，需要单独批；本机 rpiv-todo 装的 `/todos` 撞名问题因此仍未解（见 T7 观察 ②）
    - audit 一轮（观察）：`commands.todos.enabled: false` 时命令没注册，宿主会把整句当普通 prompt 交给模型（与 T7 审计里 `/exit` 被当消息同款）—— 已写进 `docs/CONFIG.md` 的代价栏，代码不动（扩展没有拦未知命令的能力）
    - 真机日志（可复核路径，跑完留在 temp）：`%LOCALAPPDATA%\Temp\pi-todo-rpc\rpc-a.log`（登记 → `/todos` → `export` → `export extra` → `clear` → `import` → `/todos`，145 行）、`rpc-b.log`（导出目录位置是文件 → error notify，2 行）、`rpc-c.log`（双空格路径 / 配对引号 / 坏名字模板，15 行）；三条日志 **0 栈行、0 `extension_error`**。重跑：把同样的 stdin 逐行喂给 `pi --mode rpc -ne -e <仓库绝对路径>/index.ts -t todo`（`PI_CODING_AGENT_SESSION_DIR` 指到 temp 免得污染真会话；run B/C 靠 `PI_CODING_AGENT_DIR` 里放的坏配置，不需要模型调用）
  - 前置：T6

- [x] T9 /todos export
  - 交付物：`toMarkdown`、`/todos export`（文件名按 `commands.export.fileNamePattern`，目录按 `commands.export.dir`，默认项目根）
  - 验收：
    - AC1 产出的 markdown 只有 `- [ ] x` / `- [x] x` 两种行，状态齐全
    - AC2 文件名带时间戳，重复导出不覆盖
  - 验收证据指针：
    - AC1 `test/view.test.ts` 的 `toMarkdown` 三条（`只有 - [ ] 与 - [x] 两种行，in_progress 归到未勾选` / `空表给空串` / `顺序与 content 原样保留`）；真机 RPC 跑里导出的 `todo-20261016-2342.md` 逐字是 `- [ ] 读 config.ts\n- [ ] 跑测试\n- [ ] 写文档`（3 条、无尾换行）
    - AC2 `test/view.test.ts` 的 `exportFileName` 三条（`{timestamp}` → `YYYYMMDD-HHmm`、个位补零、写几次替几次）；`test/index.test.ts` 的 `写到 cwd，文件名带时间戳，内容是 toMarkdown，notify 带绝对路径`（`/^todo-\d{8}-\d{4}\.md$/`）、`同名不覆盖：占住的名字让位（-2），旧文件原样留着`（`wx` 写入，EEXIST 就试 `name-2`…）、`commands.export.dir 与 fileNamePattern 跟着配置走，目录不存在就建`、`commands.export.enabled 为 false：warning 提示，一个文件都不写`
    - 口径记录：`{timestamp}` 是本地时间的分钟粒度；「不覆盖」靠 `wx` + 让位后缀（不是靠时间戳够细），同一分钟内连导两次得到 `name.md` 与 `name-2.md`；`docs/CONFIG.md` 里「模板里没有它就会覆盖同名文件」这句因此改成了让位口径
    - 偏差：AC1 的「状态齐全」按「每条任务都在 + 完成与否都有表达」收 —— markdown checklist 只有两态，`in_progress` 导出成 `- [ ]`；真机跑里读回后表头从 `Todo 0/3 · 1 doing` 变成 `Todo 0/3`，就是这条损失的现场
    - audit 一轮：① 写盘失败不再抛回宿主 —— `export` 整段 try/catch → error `notify`（单测 `IO 失败只 notify error，不抛给宿主：目录位置已经是文件（EEXIST）`；真机 `rpc-b.log` 里是 `notify[error] EEXIST: file already exists, mkdir '…\occupied'`，不再是 `extension_error`）；② `fileNamePattern` 只当文件名：空 / `.` / `..` / 带 `/`、`\` → `commands.export.fileNamePattern must be a file name, got "…"` error notify，一个文件都不写、也不为一个注定失败的名字建目录（单测同名 + 真机 `rpc-c.log`，`$TMP` 根下没有 `escaped-*`）；③ `clear` / `export` 多给参数从「静默忽略」改成用法 warning，`clear now please` 不再清表（单测 `clear / export 多给参数：用法 warning，不动状态、不写文件` + 真机 run A 第 4 条 notify）
  - 前置：T8

- [x] T10 /todos import
  - 交付物：`parseChecklist`、`/todos import <file>`
  - 验收：
    - AC1 T9 的产物能原样读回，条数与状态一致（PLAN AC5）
    - AC2 表非空时拒绝并给出提示，不动现有表
    - AC3 不认识的行忽略，不抛错
  - 验收证据指针：
    - AC1 `test/view.test.ts` 的 `读回 toMarkdown 的产物：条数与状态一致（in_progress 只能退成 pending）`；端到端 `test/index.test.ts` 的 `T9 的产物原样读回：条数与状态一致，落账并重画`（export → clear → import，entry 与 widget 都是 `[ ] a` / `[x] b`）；真机 RPC 跑里 `Imported 3 tasks from …`
    - AC2 `test/index.test.ts` 的 `表非空时拒绝：warning，不动现有表`（`Table is not empty. Run /todos clear first.`，entries 一条不多一条不改）
    - AC3 `test/view.test.ts` 的 `不认识的行一律忽略：标题、普通文本、没有勾选框的列表项` / `行首允许空白，content 两端 trim；勾选框后没内容的行忽略` / `CRLF 与空文本`；`test/index.test.ts` 的 `不认识的行忽略；超上限（21 条）时报 plan.ts 的消息且不落账` / `文件读不到：error 提示，不落账` / `缺文件名 / import 关掉：warning，不落账`
    - 口径记录：先 `parseChecklist`（宽松解析）再 `validateTasks`（严格校验：20 条、120 字符、控制字符），脏文件由 `plan.ts` 拦下、消息原样进 notify；路径支持绝对与相对（相对按 `ctx.cwd` 解析）
    - audit 一轮：import 的目标取子命令后面**整段原文**（连续空格是路径的一部分），只剥一层配对引号 —— 单测 `路径里的连续空格是路径的一部分，配对引号会被剥掉`（`a  b.md` 与 `"a  b.md"` 都能读）；真机 `rpc-c.log` 两条 `Imported 1 task from …\a  b.md` 逐字 —— 原来的 `split(/\s+/)` + `rest.join(" ")` 会把双空格折成一个
  - 前置：T9

- [ ] T11 折叠键
  - 交付物：`ui.shortcut.toggle` 接线（默认 `alt+t`）
  - 验收：
    - AC1 按键后 widget 收起 / 展开，状态不丢
    - AC2 配置成 `off` 时不注册按键
  - 验收证据指针：
    - AC1
    - AC2
  - 前置：T6

- [ ] T12 配置收口
  - 交付物：21 键全部被代码实际读到；`docs/CONFIG.md` 的样例 JSON 与 `config.ts` 默认值逐字一致
  - 验收：
    - AC1 逐键对照三处（`docs/CONFIG.md` 键表 / `config.ts` / 样例 JSON），无偏差
    - AC2 没有「只写在文档里没实现」的键，也没有「实现了没登记」的键
  - 验收证据指针：
    - AC1
    - AC2
  - 前置：T2、T8–T11

## M3 · 发布

- [ ] T13 仓库元数据
  - 交付物：`LICENSE`（MIT / setwhite）、`README.md`（中文）、`README.en.md`、`package.json` 收尾（`files` 白名单、`keywords`、`repository`）
  - 验收：
    - AC1 `pnpm pack` 出来的内容只有源码与文档 —— 不含 `prompt/`、`test/`、`docs/`
    - AC2 README 里的安装命令与配置路径跟实际一致
  - 验收证据指针：
    - AC1
    - AC2
  - 前置：T12

- [ ] T14 CI
  - 交付物：`.github/workflows/ci.yml`（ubuntu Node 22 / 24 + windows Node 22，`pnpm install --frozen-lockfile`）
  - 验收：`pnpm typecheck && pnpm test` 在三个 job 上全绿（PLAN AC7）
  - 验收证据指针：
    - AC7
  - 前置：T13

- [ ] T15 发布
  - 交付物：`.github/workflows/npm-publish.yml`（main 上 `package.json` 变化才发、版本已存在则跳过、OIDC 可信发布）
  - 验收：
    - AC1 `workflow_dispatch` 能跑通一次（可先发 0.1.0）
    - AC2 发布后能 `pi` 装上并加载，widget 正常
  - 你侧动作：npm 建包 + 在包设置里配 Trusted Publisher（仓库名 + workflow 文件名）
  - 验收证据指针：
    - AC1
    - AC2
  - 前置：T14

## 备注

- 每条任务做完就勾，并在「验收证据指针」里写下证据（文件路径 / 用例名 / 实跑输出）。
- 中途要加键、加命令、加机制 —— 先改 `docs/PLAN.md` 的「不做项」与键表，再回来动这里。
