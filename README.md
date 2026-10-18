# pi-todo-lite

[English](README.en.md) | 简体中文

pi 的 todo 扩展：模型维护一张有序的 Todo 表，输入框上方常驻显示；compaction、切分支、`--continue` 之后照旧回放。约 400 行、零运行时依赖。

## 安装

从 GitHub 装（现在就能用，跟默认分支走）：

```bash
pi install git:github.com/setwhite/pi-todo-lite   # 写进 ~/.pi/agent/settings.json
pi -e git:github.com/setwhite/pi-todo-lite        # 只试一次，不落 settings
```

从 npm 装 —— **暂不可用**，包还没发布（见 [`docs/TODO.md`](docs/TODO.md) 的 T15）：

```bash
pi install npm:pi-todo-lite
```

本机还装着 `@ssk_dev/rpiv-todo-lean` 的话先卸掉 —— 两个都注册 `todo`，模型会看到两个同名工具。

## 用法

- 模型侧只有一个工具 `todo(tasks)`：一次调用交完整张表、整表替换，`tasks: []` 表示清空。
- 表在输入框上方，默认最多 9 行（溢出先丢已完成的），`alt+t` 折叠它而任务表一寸不动。
- `/todos` 全列清单；`/todos clear` 清空；`/todos export` 导出 markdown；`/todos import <file>` 读回（表非空时先 clear）。

## 配置

`~/.pi/agent/pi-todo/config.json`（`$PI_CODING_AGENT_DIR` 可换前缀），扩展只读不写；文件不存在 → 全默认值。21 个键的默认值、区间与代价见 [`docs/CONFIG.md`](docs/CONFIG.md)，一份写满的样例在它的第 4 节。

## 开发

```bash
pnpm install
pnpm lint                          # biome check：lint + 格式化检查（`--write` 落盘）
pnpm typecheck                     # tsc --noEmit
pnpm test                          # vitest
pi -ne -e ./src/index.ts           # 从工作区直接跑，不进 settings
```

源码全在 `src/`（入口 `src/index.ts`），测试在 `test/`，仓库根只放配置与文档。

## 文档

| 文档 | 什么时候看 |
|---|---|
| [`docs/SPEC.md`](docs/SPEC.md) | 唯一契约：问题、用户故事、工具协议、界面、验收标准（AC）、不做的、术语。要改协议先改它 |
| [`docs/CONFIG.md`](docs/CONFIG.md) | 21 个键的默认值、区间与代价 —— 键表唯一来源（`test/docs.test.ts` 对账） |
| [`docs/DECISIONS.md`](docs/DECISIONS.md) | 想推翻某个设计（整表协议、状态载体、nudge、配置读取、自动清空）之前，先看当初为什么这么定 |

文档只留代码里读不出的东西：签名、导出、逐条行为看源码。

## License

MIT © setwhite
