import type { Task } from "./plan.ts";

export type WidgetConfig = {
	maxLines: number;
	header: string;
	glyphs: { pending: string; inProgress: string; completed: string };
	showCompleted: boolean;
	placement: "aboveEditor" | "belowEditor";
	/**
	 * 已完成行的样式钩子（`ui.widget.completedStyle`）：拿到的是**已经截断好**的一行，
	 * 所以贴进去的样式序列不计进宽度。不给就原样输出；`renderList` 不吃它（notify 走纯文本）。
	 */
	styleCompleted?: (text: string) => string;
};

/** 省略号就一个字符，按 code point 补在截断处。 */
const ELLIPSIS = "…";

/** 表头模板里的 doing 占位符：0 时要连同它那一整段一起省掉。 */
const DOING = "{doing}";

/**
 * 按 **code point** 截断（与 plan.ts 的长度口径同一套，不做 East Asian width）：
 * 放得下就原样返回，放不下就砍到 `width - 1` 个字符再补省略号。
 */
function truncate(line: string, width: number): string {
	const chars = Array.from(line);
	if (chars.length <= width) return line;
	if (width <= 0) return "";
	return `${chars.slice(0, width - 1).join("")}${ELLIPSIS}`;
}

/** 省掉 doing 段时，占位符前面那段：去掉尾部空白，尾巴上的 `·` 也一起去掉。 */
function trimHead(head: string): string {
	const trimmed = head.replace(/\s+$/, "");
	return trimmed.endsWith("·") ? trimmed.slice(0, -1).replace(/\s+$/, "") : trimmed;
}

/** 省掉 doing 段时，占位符后面那段：去掉紧跟在其后的一个词（默认模板里就是 `doing`）。 */
function trimTail(tail: string): string {
	const following = /^\s*\S+/.exec(tail);
	const rest = following === null ? tail : tail.slice(following[0].length);
	return rest.replace(/^\s+/, "").replace(/\s+$/, "");
}

/**
 * 表头：替换 `{done}` / `{total}` / `{doing}`，认不出的占位符当普通文本（不报错）。
 * `{doing}` 为 0 时整段「· N doing」省掉 —— 前邻的 `·` 与后邻的一个词一起去掉，
 * 于是默认模板在干完时就是 `Todo 5/5`。模板里写了几个 `{doing}` 就按这套处理几个
 * （每删一个都会重扫，删不出新占位符，所以一定收敛）。
 */
function renderHeader(template: string, counts: { done: number; total: number; doing: number }): string {
	let text = template;
	if (counts.doing === 0) {
		for (let at = text.indexOf(DOING); at !== -1; at = text.indexOf(DOING)) {
			const head = trimHead(text.slice(0, at));
			const tail = trimTail(text.slice(at + DOING.length));
			text = tail === "" ? head : `${head} ${tail}`;
		}
	}
	return text.replaceAll("{done}", String(counts.done)).replaceAll("{total}", String(counts.total)).replaceAll(DOING, String(counts.doing));
}

/** 表头要的三个计数，永远按整张表算。 */
function countTasks(tasks: readonly Task[]): { done: number; total: number; doing: number } {
	const counts = { done: 0, total: tasks.length, doing: 0 };
	for (const task of tasks) {
		if (task.status === "completed") counts.done += 1;
		else if (task.status === "in_progress") counts.doing += 1;
	}
	return counts;
}

/** 条目行：字形 + 空格 + content（content 由 plan.ts 保证单行、无控制字符）。 */
function renderRow(task: Task, glyphs: WidgetConfig["glyphs"]): string {
	const glyph = task.status === "completed" ? glyphs.completed : task.status === "in_progress" ? glyphs.inProgress : glyphs.pending;
	return `${glyph} ${task.content}`;
}

/**
 * 行预算内的取舍：装得下就全给；装不下先整条丢 completed，再砍非完成项的尾巴，
 * 末尾一行 `+N more`（N 含被丢掉的 completed）—— 汇总行自己占一格，所以条目最多 `budget - 1` 行。
 */
function layout(tasks: readonly Task[], budget: number): { shown: readonly Task[]; hidden: number } {
	if (tasks.length <= budget) return { shown: tasks, hidden: 0 };
	const unfinished = tasks.filter((task) => task.status !== "completed");
	const shown = unfinished.slice(0, Math.max(budget - 1, 0));
	return { shown, hidden: tasks.length - shown.length };
}

/**
 * widget 的内容：一行表头 + 若干条目行（溢出时再补一行 `+N more`），每行按 `width` 截断。
 * 空表返回 undefined，交给宿主把 widget 收掉；计数永远按整张表算，与显示与否无关。
 */
export function renderWidget(tasks: readonly Task[], cfg: WidgetConfig, width: number): string[] | undefined {
	if (tasks.length === 0) return undefined;

	const counts = countTasks(tasks);

	const visible = cfg.showCompleted ? tasks : tasks.filter((task) => task.status !== "completed");
	const budget = cfg.maxLines - 1;
	const { shown, hidden } = layout(visible, budget);
	const lines = [renderHeader(cfg.header, counts), ...shown.map((task) => renderRow(task, cfg.glyphs))];
	// `maxLines` 是硬上限：预算连表头都装不下时，汇总行也一并丢掉
	if (hidden > 0 && budget > 0) lines.push(`+${hidden} more`);

	return lines.map((line, index) => {
		const text = truncate(line, width);
		// 表头在 index 0，之后依次是 shown 里的条目（汇总行拿不到 task，自然不套样式）
		return shown[index - 1]?.status === "completed" && cfg.styleCompleted !== undefined ? cfg.styleCompleted(text) : text;
	});
}

/**
 * `/todos` 的清单文本：一行表头 + 每条任务一行，**不截断、不省条目** ——
 * 不受 `maxLines` 与 `showCompleted` 约束（清单的作用就是全看一遍）。
 */
export function renderList(tasks: readonly Task[], cfg: WidgetConfig): string {
	return [renderHeader(cfg.header, countTasks(tasks)), ...tasks.map((task) => renderRow(task, cfg.glyphs))].join("\n");
}

/**
 * `/todos export` 的 markdown：一行一条，只有 `- [ ] x` / `- [x] x` 两种形状。
 * `in_progress` 归到未勾选（markdown checklist 没有第三种状态）。
 */
export function toMarkdown(tasks: readonly Task[]): string {
	return tasks.map((task) => `- [${task.status === "completed" ? "x" : " "}] ${task.content}`).join("\n");
}

/** checklist 的一行：`- [ ] 内容` / `- [x] 内容`，行首允许空白。 */
const CHECKLIST = /^\s*-\s*\[(.)\]\s*(.+)$/;

/**
 * `/todos import` 吃进来的 markdown：只认 checklist 行，其余一律忽略（不报错）。
 * `[x]` / `[X]` → `completed`，其它勾选态（含 `[-]`）→ `pending`；content 两端 trim。
 */
export function parseChecklist(text: string): Task[] {
	const tasks: Task[] = [];
	for (const line of text.split(/\r?\n/)) {
		const match = CHECKLIST.exec(line);
		if (match === null) continue;
		const content = (match[2] ?? "").trim();
		if (content === "") continue;
		const mark = match[1];
		tasks.push({ content, status: mark === "x" || mark === "X" ? "completed" : "pending" });
	}
	return tasks;
}

/** 两个字符的补零：20260102-0304 这种形状。 */
function pad(value: number): string {
	return String(value).padStart(2, "0");
}

/** `/todos export` 的文件名：模板里的 `{timestamp}` 替成 `YYYYMMDD-HHmm`（本地时间）。 */
export function exportFileName(pattern: string, at: Date): string {
	const stamp = `${at.getFullYear()}${pad(at.getMonth() + 1)}${pad(at.getDate())}-${pad(at.getHours())}${pad(at.getMinutes())}`;
	return pattern.replaceAll("{timestamp}", stamp);
}
