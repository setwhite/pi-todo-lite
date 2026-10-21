# TODO — pi-todo-lite

> 当前无未完成任务。M1 / M2 / M2.5 / M3 与 dev QA 均已验收（2026-10-17 ~ 10-18）；发布记录见 `CHANGELOG.md`。
> 验收标准（AC1–AC8）在 `docs/SPEC.md`，本文件不抄；逐条交付与过程看 git log。

## 待办

（空）

## 已验收

| 里程碑 | 任务 | 证据 |
|---|---|---|
| M1 / M2 | T1–T12：骨架、`config.ts`、校验、回放、widget、接线、`/todos`、折叠键、文档对账 | `test/*.test.ts`、`src/` |
| M2.5 | T16 / T18：auto-clear 从 `fade` 改为 `clear`，触发点从 `agent_settled` 挪到 `input`，默认档 `model` → `clear` | `test/index.test.ts`、`docs/SPEC.md` AC8 |
| M3 | T13–T15：仓库元数据、CI、OIDC 发布（0.1.0 / 0.1.1；0.1.1 带 provenance） | `.github/workflows/`、`CHANGELOG.md`、npm provenance（run `39140629898`） |
| dev QA | T17：biome（80 列 / tab / 只扫 `src`、`test`）+ `.gitattributes` 钉 LF | `biome.json`、CI |

## 规则

- 任务按开发顺序排，每条单次会话可完成；新任务写清交付物、验收与前置。
- 加键、加命令、加机制：先改 `docs/SPEC.md` 与 README 的配置示例，再回来动这里。
- 证据只记可复跑的指针（测试用例名、命令输出、commit）；做完勾掉，细节留给 git log。
