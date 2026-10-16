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
    - AC2 用例：`JSON 损坏：报绝对路径与 invalid JSON` / `顶层不是对象：报 expected object, got <值>` / `对象位置放数组或标量：报字段路径 + expected object` / `未知键在任意层级都报完整字段路径` / `类型错按 expected <类型>, got <值> 报，字符串带回引号` / `布尔与非整数都按类型错拒绝` / `枚举错列出全部合法值` / `工具名不合法时代码报字段路径` / `字符串数组逐元素报下标` / `多处错误一次列完，不半途而废`（4 条错误的顺序也断言了）
    - AC3 用例：`数值越界 clamp 到上界，不报错`（500→200、1000→400、50→10）/ `数值越界 clamp 到下界，不报错`（0→1、1→3）/ `区间内的数值原样保留`
    - AC4 用例：`configPath 优先于 $PI_CODING_AGENT_DIR`（9 赢 7）/ `$PI_CODING_AGENT_DIR 优先于 ~/.pi/agent`（读到 7）/ `都没有时落到 ~/.pi/agent/pi-todo/config.json`（走 `resolveConfigPath`）/ `$PI_CODING_AGENT_DIR 是相对路径时按 cwd 解析成绝对路径` / `$PI_CODING_AGENT_DIR 指向的目录没有配置文件时取默认值`
    - 契约新增两个导出：`DEFAULTS`、`resolveConfigPath`（home 分支不起文件才可测），契约与取舍已同步 `docs/modules/config.md`；多条错误用 `\n` 连接（首条带 `pi-todo config <路径>:` 前缀），非整数按类型错拒绝，部分对象逐键与默认值合并
    - audit 追修（两条）：`resolveConfigPath` 对 `$PI_CODING_AGENT_DIR` 也走 `resolve()`，相对 env 的错误消息实测为绝对路径；`docs/PLAN.md:39,107`、`docs/CONFIG.md:67,69` 的 description 字符数 39 → 37（`config.ts` 于 `prompt/my prompt new/description.md` 正文逐字一致，实测 37），guidelines 标成「占位符 146 / 替成 `todo` 后 136」
  - 前置：T1

- [ ] T3 plan.ts 校验
  - 交付物：`plan.ts` 的 `Status` / `Task` / `validateTasks`、`test/plan.test.ts`
  - 验收：
    - AC1 空 content、121 字符、21 项、非法 status、`tasks` 非数组 —— 全部拒绝且抛 `Error`（PLAN AC1）
    - AC2 报错消息带第几条与真实上限（`todo: task 3: content is 128 chars, max is 120`）
    - AC3 返回 trim 过的新数组，不改入参
  - 验收证据指针：
    - AC1
    - AC2
    - AC3
  - 前置：T1

- [ ] T4 plan.ts 回放与文本
  - 交付物：`replayTasks`、`formatTasks`、`test/plan.test.ts` 续
  - 验收：
    - AC1 一串 entries（中间混入坏条目）取到最后一条有效快照；一条都没有 → `[]`（PLAN AC2）
    - AC2 只认 `type: "custom"` + `customType: "pi-todo-state"`，不读 toolResult 的 details
    - AC3 `formatTasks` 空表 → `Todo 0/0`；非空 → 一行进度 + 每项一行带 `[ ]` / `[-]` / `[x]`
  - 验收证据指针：
    - AC1
    - AC2
    - AC3
  - 前置：T3

- [ ] T5 view.ts widget 行
  - 交付物：`renderWidget`、`test/view.test.ts`
  - 验收：
    - AC1 0 / 1 / 20 条 × 宽度 40 / 80 / 120：行数、`…` 截断、`+N more` 都符合预期（PLAN AC3）
    - AC2 空表返回 `undefined`；表头 `{doing}` 为 0 时省略 `· … doing`
    - AC3 超出行预算时先整条丢 completed，再砍非完成项的尾巴
  - 验收证据指针：
    - AC1
    - AC2
    - AC3
  - 前置：T3

- [ ] T6 index.ts 接线
  - 交付物：`index.ts`（读配置 → 注册工具、三个会话事件 → `appendEntry` → `setWidget` 组件工厂）；模型侧文案从 `prompt/my prompt new/` 搬入，`tool-name:` 替成配置里的真实工具名
  - 验收：
    - AC1 工具名取 `tools.todo.name`；description / guidelines / schema 与定稿逐字一致（可脚本比对）
    - AC2 一次调用后 `getBranch()` 里出现一条 `pi-todo-state`，`data.tasks` 与入参一致
    - AC3 三个事件从空 entries 回放都不抛错
  - 验收证据指针：
    - AC1
    - AC2
    - AC3
  - 前置：T2、T4、T5

- [ ] T7 真机验收
  - 交付物：一次实跑记录（命令、任务、观察到的 widget 与工具返回值）；发现问题回改对应模块
  - 验收：`pi -e ./index.ts` 起一个 ≥ 3 步任务：表出现在输入框上方；`/todos` 打出清单；模型传 `tasks: []` 后 widget 消失（PLAN AC4）
  - 风险：本机安装的 `@ssk_dev/rpiv-todo-lean` 也注册 `todo` —— 跑之前先卸掉它，或临时把 `tools.todo.name` 改成别的
  - 验收证据指针：
    - AC4
  - 前置：T6

## M2 · 命令与配置收口

- [ ] T8 /todos 骨架 + 清单 + clear
  - 交付物：命令注册、`renderList`、`/todos clear`
  - 验收：
    - AC1 `/todos` 全列清单（不截断、不省条目），走 `ctx.ui.notify`
    - AC2 `/todos clear` 后 widget 消失，会话里多一条空表账
    - AC3 `ctx.ui` 缺失（RPC / print）时不抛错
  - 验收证据指针：
    - AC1
    - AC2
    - AC3
  - 前置：T6

- [ ] T9 /todos export
  - 交付物：`toMarkdown`、`/todos export`（文件名按 `commands.export.fileNamePattern`，目录按 `commands.export.dir`，默认项目根）
  - 验收：
    - AC1 产出的 markdown 只有 `- [ ] x` / `- [x] x` 两种行，状态齐全
    - AC2 文件名带时间戳，重复导出不覆盖
  - 验收证据指针：
    - AC1
    - AC2
  - 前置：T8

- [ ] T10 /todos import
  - 交付物：`parseChecklist`、`/todos import <file>`
  - 验收：
    - AC1 T9 的产物能原样读回，条数与状态一致（PLAN AC5）
    - AC2 表非空时拒绝并给出提示，不动现有表
    - AC3 不认识的行忽略，不抛错
  - 验收证据指针：
    - AC1
    - AC2
    - AC3
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
