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

- `renderWidget`：空表返回 `undefined`（widget 消失）。第一行表头，默认模板 `Todo {done}/{total} · {doing} doing`，`{doing}` 为 0 时整段 `· … doing` 省略。行预算 `cfg.maxLines - 1`（表头占一行）；超预算先整条丢 completed，再砍非完成项的尾巴，末尾补一行 `+N more`。每行按 `width` 截断，省略号用 `…`。
- `renderList`：`/todos` 用。不截断、不省条目，全列。
- `toMarkdown` / `parseChecklist`：只用 `- [ ] x` / `- [x] x` 一种格式闭环。`parseChecklist` 忽略不认识的行，`[x]` → `completed`，其余勾选态 → `pending`。

## 取舍

- 不设颜色、不做主题：跟着 pi 的主题走。
- 不做自定义 `renderResult`：markdown checklist 的默认渲染够用。
- 截断在渲染期做，不在校验期做 —— 表里存原文，显示时按当下列宽裁。
