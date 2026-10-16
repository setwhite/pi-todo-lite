# config.ts

读 `<agent dir>/pi-todo/config.json`。只读不写。

## 契约

```ts
export type Config = { /* 21 个键，见 docs/CONFIG.md */ };
export type LoadOptions = { configPath?: string; env?: NodeJS.ProcessEnv };
export const DEFAULTS: Config;
export function resolveConfigPath(options?: LoadOptions): string;
export function loadConfig(options?: LoadOptions): Config;
```

- 路径优先级：`options.configPath` > `$PI_CODING_AGENT_DIR` > `~/.pi/agent`，后两级都拼 `pi-todo/config.json`。两个入参若是相对路径都按 cwd 解析，返回值与错误消息里的路径一律绝对。
- 文件不存在（ENOENT）：全默认值，不报错；其它 fs 错误（EACCES、EISDIR 等）原样抛出，不包装。
- JSON 坏、未知键、类型或枚举错：抛 `Error`，首行 `pi-todo config <绝对路径>: <字段路径>: <原因>`，后续每条错误占一行（`\n` 连接），一次列完；顶层不是对象时报 `expected object, got <值>`。
- 数值越界：clamp 到区间，不报错；非整数（`4.5`）按类型错拒绝，因为行数/条数不能是小数。
- 部分对象逐键与默认值合并（`ui.widget.glyphs` 也是），缺席的键不算错。
- 每次返回全新对象：`DEFAULTS` 与返回值不共享引用，调用方随便改。

## 用法

```ts
import { loadConfig } from "./config.ts";

const config = loadConfig({ configPath, env }); // 两参都是测试用的注入点
```

## 取舍

- 单文件，不拆目录（你拍板）。
- 默认值与区间只在这里定义一份，`docs/CONFIG.md` 是它的文档；改键要两边一起改。
- 不做热重载、不做写回。
- `env` 可选注入是为了测试不碰真实 home；只读其中的 `PI_CODING_AGENT_DIR`，不看别的环境变量。
- `resolveConfigPath` 单独导出，好让「环境变量 > home」这条优先级在不起文件的前提下可测。
- `guidance.*` 的默认文案里 `tool-name:` 是占位符，替换发生在 `index.ts` 注册时，本模块原样存。
