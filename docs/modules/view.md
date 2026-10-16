# view.ts

显示与文本：widget 的每一行、`/todos` 的输出、markdown 导出与导入解析。只从 `plan.ts` 取类型。

## 契约

```ts
export type WidgetConfig = {
  maxLines: number;
  header: string;
  glyphs: { pending: string; inProgress: string; completed: string };
  showCompleted: boolean;
  placement: "aboveEditor" | "belowEditor";
};

export function renderWidget(
  tasks: readonly Task[],
  cfg: WidgetConfig,
  width: number,
): string[] | undefined;
export function renderList(tasks: readonly Task[], cfg: WidgetConfig): string;
export function toMarkdown(tasks: readonly Task[]): string;
export function parseChecklist(text: string): Task[];
```

- `renderWidget`：空表返回 `undefined`（widget 消失）。
  - 第一行表头，模板里的 `{done}` / `{total}` / `{doing}` 替换成计数（永远按**整张表**算，与显示与否无关），认不出的占位符当普通文本。默认模板 `Todo {done}/{total} · {doing} doing`；`{doing}` 为 0 时整段「· N doing」省掉 —— 删的是占位符本身 + 前邻的 `·`（若有）+ 后邻紧跟的那一个词，于是干完时是 `Todo 5/5`。模板里写了几个 `{doing}` 就按这套删几个；`{doing}` 不为 0 时每个都替换成计数。
  - 条目行 = 字形 + 空格 + content，字形取 `cfg.glyphs`（完成/进行中/待办三态）。
  - 行预算 `cfg.maxLines - 1`（表头占一行），`maxLines` 是总行数。超预算先整条丢 completed，再砍非完成项的尾巴，末尾补一行 `+N more` —— N 含被丢掉的 completed（`showCompleted: false` 时 completed 本就不列，故不计入），汇总行自己占一格（所以溢出时条目最多 `maxLines - 2` 行）。
  - `maxLines` 是硬上限：预算连表头都装不下时（`maxLines` ≤ 1）只剩表头一行，汇总行也一并丢掉；`config.ts` 把 `maxLines` clamp 在 3–10，所以真实配置走不到这里。
  - `showCompleted: false`：completed 不逐条列出，只进表头计数；其余规则不变（表全是 completed 时只剩表头一行，widget 不消失）。
  - 每行按 `width` 截断：按 **code point** 数（与 `plan.ts` 的长度口径同一套，不做 East Asian width），放不下就砍到 `width - 1` 个字符再补 `…`；`width` ≤ 0 给空行。
- `renderList`：`/todos` 用。不截断、不省条目，全列。
- `toMarkdown` / `parseChecklist`：只用 `- [ ] x` / `- [x] x` 一种格式闭环。`parseChecklist` 忽略不认识的行，`[x]` → `completed`，其余勾选态 → `pending`。

## 取舍

- 不设颜色、不做主题：跟着 pi 的主题走。
- 不做自定义 `renderResult`：markdown checklist 的默认渲染够用。
- 截断在渲染期做，不在校验期做 —— 表里存原文，显示时按当下列宽裁。
- 宽度按 code point 数，不按终端列宽：与 `plan.ts` 一套口径，CJK / emoji 一律算 1 个 —— 真要按列宽得再引入一张 East Asian width 表。
- 溢出时**不**用 completed 回填空位（rpiv 会回填）：我们的规则是「超预算先整条丢 completed」，宁可少显示一行也不把做完的顶回来。
