# TODO — pi-todo-lite

> 状态：M1、M2 已验收（2026-10-17），M2.5（auto-clear）已验收（2026-10-18）；M3 未开工。
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
## M3 · 发布

- [~] T13 仓库元数据
  - 交付物：`LICENSE`（MIT / setwhite）、`README.md` 补安装与用法、`README.en.md`、`package.json` 收尾（`files` 白名单、`keywords`、`repository`）；仓库 `github.com/setwhite/pi-todo-lite`（公开）
  - 验收：
    - AC1 `pnpm pack` 出来的内容只有源码与文档 —— 不含 `prompt/`、`test/`、`docs/`
    - AC2 README 里的安装命令与配置路径跟实际一致
  - 前置：T12

- [~] T14 CI
  - 交付物：`.github/workflows/ci.yml`（ubuntu Node 22 / 24 + windows Node 22，`pnpm install --frozen-lockfile`）
  - 验收：`pnpm typecheck && pnpm test` 在三个 job 上全绿（`docs/SPEC.md` 的 AC7）
  - 前置：T13

- [ ] T15 发布
  - 交付物：`.github/workflows/npm-publish.yml`（main 上 `package.json` 变化才发、版本已存在则跳过、OIDC 可信发布）
  - 验收：
    - AC1 `workflow_dispatch` 能跑通一次（可先发 0.1.0）
    - AC2 发布后能 `pi` 装上并加载，widget 正常
  - 你侧动作：npm 建包 + 在包设置里配 Trusted Publisher（仓库名 + workflow 文件名）
  - 前置：T14

## 备注

- 中途要加键、加命令、加机制 —— 先改 `docs/SPEC.md` 的「不做的」与 `docs/CONFIG.md` 的键表，再回来动这里。
