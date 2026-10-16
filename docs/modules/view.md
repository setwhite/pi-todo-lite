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
export function exportFileName(pattern: string, at: Date): string;
```

- `renderWidget`：空表返回 `undefined`（widget 消失）。
  - 第一行表头，模板里的 `{done}` / `{total}` / `{doing}` 替换成计数（永远按**整张表**算，与显示与否无关），认不出的占位符当普通文本。默认模板 `Todo {done}/{total} · {doing} doing`；`{doing}` 为 0 时整段「· N doing」省掉 —— 删的是占位符本身 + 前邻的 `·`（若有）+ 后邻紧跟的那一个词，于是干完时是 `Todo 5/5`。模板里写了几个 `{doing}` 就按这套删几个；`{doing}` 不为 0 时每个都替换成计数。
  - 条目行 = 字形 + 空格 + content，字形取 `cfg.glyphs`（完成/进行中/待办三态）。
  - 行预算 `cfg.maxLines - 1`（表头占一行），`maxLines` 是总行数。超预算先整条丢 completed，再砍非完成项的尾巴，末尾补一行 `+N more` —— N 含被丢掉的 completed（`showCompleted: false` 时 completed 本就不列，故不计入），汇总行自己占一格（所以溢出时条目最多 `maxLines - 2` 行）。
  - `maxLines` 是硬上限：预算连表头都装不下时（`maxLines` ≤ 1）只剩表头一行，汇总行也一并丢掉；`config.ts` 把 `maxLines` clamp 在 3–10，所以真实配置走不到这里。
  - `showCompleted: false`：completed 不逐条列出，只进表头计数；其余规则不变（表全是 completed 时只剩表头一行，widget 不消失）。
  - 每行按 `width` 截断：按 **code point** 数（与 `plan.ts` 的长度口径同一套，不做 East Asian width），放不下就砍到 `width - 1` 个字符再补 `…`；`width` ≤ 0 给空行。
- `renderList`：`/todos` 用。不截断、不省条目，全列。
- `toMarkdown`：一行一条，只有 `- [ ] x` / `- [x] x` 两种形状，顺序照原表；空表给空串、无尾换行。markdown checklist 只有两态，所以 **`in_progress` 导出成未勾选**。
- `parseChecklist`：按行扫 `^\s*-\s*\[(.)\]\s*(.+)$`，不认识的行一律忽略（标题、散文、没有勾选框的列表项、空文本）；`[x]` / `[X]` → `completed`，其余勾选态（含 `[-]`）→ `pending`；content 两端 trim，trim 后为空的行也忽略。
- `exportFileName`：把 `pattern` 里的 `{timestamp}` 替成 `YYYYMMDD-HHmm`（**本地时间**，个位补零；写几次替几次；没写占位符就原样返回）。让位（`-2`、`-3`…）是 `index.ts` 落盘时的事，不在这里。

## 取舍

- `ui.widget.completedStyle` 的实现是 `WidgetConfig.styleCompleted` 钩子（`index.ts` 用主题的方法填）：`renderWidget` 只负责在**截断之后**把已完成的行交给钩子，所以样式序列不计进宽度；`renderList`（notify 纯文本）不吃这个钩子。
- `renderList` 不吃 `maxLines` 也不吃 `showCompleted`，更不按宽度截断：清单的用处就是全看一遍，widget 那套预算只属于 widget。
- 三态压两态是**有损**的：`in_progress` 导出成 `- [ ]`、读回变 `pending`。要无损得自定义第三种勾选框，markdown 生态不认。
- 不设颜色、不做主题：跟着 pi 的主题走。
- 不做自定义 `renderResult`：markdown checklist 的默认渲染够用。
- 截断在渲染期做，不在校验期做 —— 表里存原文，显示时按当下列宽裁。
- 宽度按 code point 数，不按终端列宽：与 `plan.ts` 一套口径，CJK / emoji 一律算 1 个 —— 真要按列宽得再引入一张 East Asian width 表。
- 溢出时**不**用 completed 回填空位（rpiv 会回填）：我们的规则是「超预算先整条丢 completed」，宁可少显示一行也不把做完的顶回来。
