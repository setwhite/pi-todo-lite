# config.ts

读 `<agent dir>/pi-todo/config.json`。只读不写。

## 契约

```ts
export type Config = { /* 21 个键，见 docs/CONFIG.md */ };
export function loadConfig(opts?: {
  configPath?: string;
  env?: NodeJS.ProcessEnv;
}): Config;
```

- 路径优先级：`opts.configPath` > `$PI_CODING_AGENT_DIR/pi-todo/config.json` > `~/.pi/agent/pi-todo/config.json`。
- 文件不存在：全默认值，不报错。
- JSON 坏、未知键、类型或枚举错：抛 `Error`，消息形如 `pi-todo config /abs/path/config.json: ui.widget.maxLines: expected number, got "9"`，多条一次列完。
- 数值越界：clamp 到 `RANGES`，不报错。
- 只读 `opts.env` 里的 `PI_CODING_AGENT_DIR`，不看别的环境变量。

## 取舍

- 单文件，不拆目录（你拍板）。
- 默认值与区间只在这里定义一份，`docs/CONFIG.md` 是它的文档；改键要两边一起改。
- 不做热重载、不做写回。
