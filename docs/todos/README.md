# 任务台账 · pi-todo-lite

> 没有进行中的里程碑；下面两条待办未排期。M1 / M2 / M2.5 / M3、dev QA 与 M4（工程化加固）均已验收（2026-10-17 ~ 10-22）；发布记录见 `CHANGELOG.md`。
> 验收标准（AC1–AC8）在 `docs/specs/0001-pi-todo-lite.md`，本文件不抄；逐条交付与过程看 git log。

## 待办

- [ ] 模型侧文案按实测再调：两条 guideline 够不够让模型整表重发（文案在 `src/config.ts` 的 `DEFAULTS.guidance`）。
- [ ] 改命令名：`/todos` 与本机的 `@ssk_dev/rpiv-todo-lean` 撞名（要动 `src/index.ts` 与 README 的用法说明）。

## 已验收

| 里程碑 | 任务 | 证据 |
|---|---|---|
| M1 / M2 | T1–T12：骨架、`config.ts`、校验、回放、widget、接线、`/todos`、折叠键、文档对账 | `test/*.test.ts`、`src/` |
| M2.5 | T16 / T18：auto-clear 从 `fade` 改为 `clear`，触发点从 `agent_settled` 挪到 `input`，默认档 `model` → `clear` | `test/index.test.ts`、`docs/specs/0001-pi-todo-lite.md` AC8 |
| M3 | T13–T15：仓库元数据、CI、OIDC 发布（0.1.0 / 0.1.1；0.1.1 带 provenance） | `.github/workflows/`、`CHANGELOG.md`、npm provenance（run `39140629898`） |
| dev QA | T17：biome（80 列 / tab / 只扫 `src`、`test`、`scripts`）+ `.gitattributes` 钉 LF | `biome.json`、CI |
| M4 | T19：发布物与依赖方向守卫（`test/package.test.ts`、`scripts/check-imports.mjs`） | `pnpm check:imports` 输出 `ok: 4 files`；副本注入 `config.ts → plan.ts` 与 `view.ts` 值导入 plan 后各报一条并退出 1；`pnpm test` 6 files / 142 tests，含发布物四条断言（`pnpm pack --dry-run --json` 实测 8 文件、`files` 与入口全覆盖） |
| M4 | T20：提交前闸 `.githooks/pre-commit`（lint / check:imports / typecheck / test） | `sh .githooks/pre-commit` 实测 3.3 秒一次通过；启用方式 `git config core.hooksPath .githooks` |
| M4 | T21：CI 与供应链加固（action 按 SHA、`--error-on-warnings`、`timeout-minutes`、publish 前 tarball 断言、每日 `pnpm audit`） | `.github/workflows/`；本地 `pnpm lint` 12 files 零诊断 |

## 规则

- 任务按开发顺序排，每条单次会话可完成；新任务写清交付物、验收与前置。
- 加键、加命令、加机制：先改 README 的配置示例与 `docs/specs/` 里对应的用户故事或 AC，再回来动这里。
- 证据只记可复跑的指针（测试用例名、命令输出、commit）；做完勾掉，细节留给 git log。
