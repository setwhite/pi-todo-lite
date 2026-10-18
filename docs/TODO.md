# TODO — pi-todo-lite

> 状态：M1、M2 已验收（2026-10-17），M2.5（auto-clear）已验收（2026-10-18）；M3 进行中 —— T13 / T14 已验收（2026-10-18），T15 交付物已就绪、等首发布与 AC 验收（2026-10-18）；T16（biome）交付物已就绪，等 CI 绿。
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

- [~] T15 发布
  - 交付物：`.github/workflows/npm-publish.yml`（main 上 `package.json` 变化才发、版本已存在则跳过、OIDC 可信发布）。发布 job 用 Node 24（自带 npm ≥ 11.5.1，OIDC 的硬要求），发布前先跑 typecheck + test
  - 验收：
    - AC1 `workflow_dispatch` 能跑通一次（可先发 0.1.0）
    - AC2 发布后能 `pi` 装上并加载，widget 正常
  - 你侧动作（顺序要紧）：npm 不允许 OIDC 发首版 —— 包得先在 npm 上存在，才能在包设置里配 Trusted Publisher：
    1. 本地 `npm publish` 发 0.1.0（现在是首个已发版本）
    2. 包设置里配 Trusted Publisher：`setwhite` / `pi-todo-lite` / workflow 文件名 `npm-publish.yml`（只填文件名，带 `.yml`；这类配置首配后 2 天内要发成一次，否则作废）
    3. 版本升到 0.1.1 走 `workflow_dispatch`，验证 OIDC 真发布 —— 这才是 AC1
    4. 发成后把 `README.md` / `README.en.md` 里「暂不可用」那段换成 npm 安装，顺带关掉 T15
  - 前置：T14

## 工程 · dev QA

- [~] T16 biome 接入
  - 交付物：`biome.json`（Biome 默认行宽 80、tab 缩进，只扫 `src/**` 与 `test/**`）、`package.json` 的 `lint` / `lint:fix`、`ci.yml` 与 `npm-publish.yml` 都跑 `pnpm lint`；`plan.ts` 里 `noControlCharactersInRegex` 用行内 ignore 并写明 why。devDep 精确钉 `2.5.15` —— 格式化器的小版本也会改输出，钉死免得平白 churn
  - 验收：
    - AC1 `pnpm lint` 退出 0、零诊断（9 个源文件全部按 Biome 格式化）
    - AC2 `pnpm typecheck` 与 `pnpm test` 仍全绿（格式化不动语义）
    - AC3 `ci.yml` 的 check job 与 `npm-publish.yml` 的发布闸门都跑 `pnpm lint`
  - 你侧动作：push 后看 CI 三个 job 绿 —— AC3 的远端部分
  - 前置：T14

## 备注

- 中途要加键、加命令、加机制 —— 先改 `docs/SPEC.md` 的「不做的」与 `docs/CONFIG.md` 的键表，再回来动这里。
