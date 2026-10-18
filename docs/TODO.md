# TODO — pi-todo-lite

> 状态：M1、M2 已验收（2026-10-17），M2.5（auto-clear）已验收（2026-10-18）；M3 进行中 —— T13 / T14 已验收（2026-10-18），T17（biome）已验收（2026-10-18）；T15 已验收：0.1.1 经 OIDC 发布、带 provenance（2026-10-18）；T18（clear 挪到用户发消息 + 默认档）已验收（2026-10-18）。
> 任务按开发顺序排，每条单次会话可完成。验收标准（AC1–AC8）在 `docs/SPEC.md`，本文件不抄。
> 做完就勾：证据是 `test/*.test.ts` 的用例名与真机日志，本文件不复述。

## 已完成（M1 · M2，2026-10-17）

| T | 交付 |
|---|---|
| T1 | 仓库骨架：`package.json` / `tsconfig.json` / `pnpm-lock.yaml`，scripts `test` / `typecheck` |
| T2 | `config.ts`：21 键的类型、默认值、校验、clamp |
| T3 | `plan.ts` 校验：`validateTasks` 全有或全无、一次列完违规 |
| T4 | `plan.ts` 回放与文本：`replayTasks`（坏快照整条跳过）/ `formatTasks` |
| T5 | `view.ts` widget 行：`renderWidget` 的行预算与截断 |
| T6 | `index.ts` 接线：工具注册 + 三个会话事件 + widget 工厂 + 模型侧文案 |
| T7 | 真机验收：TUI / headless / RPC 三种跑法 |
| T8 | `/todos` 骨架 + 全列清单 + `clear`，notify 渠道落定 |
| T9 | `/todos export`：时间戳文件名、同名让位、目录可配 |
| T10 | `/todos import`：宽松解析 + 严格校验、表非空拒绝 |
| T11 | 折叠键 `alt+t` |
| T12 | 配置收口：`test/docs.test.ts` 对账键表与 `DEFAULTS` |

## M2.5 · auto-clear

- [x] T16 `lifecycle.onFinish`：`"fade"` 换成 `"clear"`
  - 交付物：`config.ts` 的 `ON_FINISH` 换成 `model / keep / clear`；`index.ts` 的 `agent_settled` 分支改成整表完成后 `commit([])`；`test/index.test.ts` 用例
  - 验收：
    - AC1 整表 `completed` 且 `agent_settled` 后，会话里多一条 `{tasks: []}` 快照、回放得到空表、widget 渲染成空（`docs/SPEC.md` 的 AC8）
    - AC2 空表或还有未完成项时不写账
    - AC3 `model` / `keep` 不监听 `agent_settled`，行为不变
    - AC4 `docs/CONFIG.md` 的取值列与 `config.ts` 的枚举逐字一致，`docs.test.ts` 仍绿
- [x] T18 clear 改在用户发消息时清，默认档换成 clear
  - 交付物：`config.ts` 的 `DEFAULTS.lifecycle.onFinish` 由 `model` 换成 `clear`；`index.ts` 的自动清空从 `agent_settled` 挪到 `input`（source 不筛：interactive / rpc / extension 一样），守卫不变（表非空且整表 `completed`）
  - 为什么：`agent_settled` 一到就清，是在用户眼皮底下把表抽走，他多半还没看完；挪到「用户发下一条消息」，看完是有保证的（`docs/DECISIONS.md#6`）
  - 验收：
    - AC1 默认档（不写配置）就是 `clear`：整表完成后 `emit input` 多一条 `{tasks: []}` 快照、回放得到空表、widget 变空；`agent_settled` 纹丝不动
    - AC2 空表、或还有未完成项时，`input` 不写账
    - AC3 `model` / `keep` 不监听 `input`；`model` 仍注册「干完发空表能清」那条 guideline，默认档不注册（模型侧文案 141 → 80 字符）
    - AC4 `docs/CONFIG.md` 的默认值与 `DEFAULTS` 逐字一致，`docs.test.ts` 仍绿
  - 前置：T16

## M3 · 发布

- [x] T13 仓库元数据
  - 交付物：`LICENSE`（MIT / setwhite）、`README.md` 补安装与用法、`README.en.md`、`package.json` 收尾（`files` 白名单、`keywords`、`repository`）；仓库 `github.com/setwhite/pi-todo-lite`（公开）
  - 验收：
    - AC1 `pnpm pack` 出来的内容只有源码与文档 —— 不含 `prompt/`、`test/`、`docs/`
    - AC2 README 里的安装命令与配置路径跟实际一致
  - 前置：T12

- [x] T14 CI
  - 交付物：`.github/workflows/ci.yml`（ubuntu Node 22 / 24 + windows Node 22，`pnpm install --frozen-lockfile`）
  - 验收：`pnpm typecheck && pnpm test` 在三个 job 上全绿（`docs/SPEC.md` 的 AC7）
  - 前置：T13

- [x] T15 发布
  - 交付物：`.github/workflows/npm-publish.yml`（main 上 `package.json` 变化才发、版本已存在则跳过、OIDC 可信发布）。发布 job 用 Node 24（自带 npm ≥ 11.5.1，OIDC 的硬要求），发布前先跑 `pnpm lint && pnpm typecheck && pnpm test`
  - 已上线：0.1.0 本地 `npm publish`（2026-10-18）；0.1.1 走 workflow 的 OIDC（2026-10-18，run `39140629898`）—— 日志里是 `Signed provenance statement with source and build information from GitHub Actions`，provenance 已进 transparency log
  - 验收：
    - AC1 ✅ 版本一变、push 到 main 就触发；registry 上 0.1.1 的 `dist.attestations` 非空（`provenance`，SLSA v1）—— 本地发的 0.1.0 没有，这就是 OIDC 跑通的证据
    - AC2 ✅ `pi install npm:pi-todo-lite` 装上、widget 正常（你侧真机确认）
  - 注意：`@ssk_dev/rpiv-todo-lean` 也注册 `todo` 工具，两个一起加载会报 `Tool "todo" conflicts` —— 装本包前先 `pi remove` 它，或者把 `tools.todo.name` 改掉
  - 前置：T14

## 工程 · dev QA

- [x] T17 biome 接入
  - 交付物：`biome.json`（Biome 默认行宽 80、tab 缩进，只扫 `src/**` 与 `test/**`）、`package.json` 的 `lint` / `lint:fix`、`ci.yml` 与 `npm-publish.yml` 都跑 `pnpm lint`；`plan.ts` 里 `noControlCharactersInRegex` 用行内 ignore 并写明 why。devDep 精确钉 `2.5.15` —— 格式化器的小版本也会改输出，钉死免得平白 churn
  - 验收：
    - AC1 `pnpm lint` 退出 0、零诊断（9 个源文件全部按 Biome 格式化）
    - AC2 `pnpm typecheck` 与 `pnpm test` 仍全绿（格式化不动语义）
    - AC3 `ci.yml` 的 check job 与 `npm-publish.yml` 的发布闸门都跑 `pnpm lint`
  - 证据（2026-10-18）：CI run `5836a76` 三个 job 全绿（AC3 的远端部分）；配套加 `.gitattributes` 的 `eol=lf` —— windows runner 默认 `core.autocrlf=true`，不钉行尾就报 10 个格式化错
  - 前置：T14

## 备注

- 中途要加键、加命令、加机制 —— 先改 `docs/SPEC.md` 的「不做的」与 `docs/CONFIG.md` 的键表，再回来动这里。
