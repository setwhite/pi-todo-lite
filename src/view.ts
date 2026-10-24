import type { Task } from "./plan.ts";

export type WidgetConfig = {
	maxLines: number;
	header: string;
	glyphs: { pending: string; inProgress: string; completed: string };
	showCompleted: boolean;
	placement: "aboveEditor" | "belowEditor";
	/** 拿到的是截断后的一行，所以样式序列不计进宽度。 */
	styleCompleted?: (text: string) => string;
};

const ELLIPSIS = "…";

const DOING = "{doing}";

/** 与 plan.ts 同一套 code point 口径，不做 East Asian width。 */
function truncate(line: string, width: number): string {
	const chars = Array.from(line);
	if (chars.length <= width) return line;
	if (width <= 0) return "";
	return `${chars.slice(0, width - 1).join("")}${ELLIPSIS}`;
}

function trimHead(head: string): string {
	const trimmed = head.replace(/\s+$/, "");
	return trimmed.endsWith("·")
		? trimmed.slice(0, -1).replace(/\s+$/, "")
		: trimmed;
}

function trimTail(tail: string): string {
	const following = /^\s*\S+/.exec(tail);
	const rest = following === null ? tail : tail.slice(following[0].length);
	return rest.replace(/^\s+/, "").replace(/\s+$/, "");
}

function renderHeader(
	template: string,
	counts: { done: number; total: number; doing: number },
): string {
	let text = template;
	if (counts.doing === 0) {
		for (let at = text.indexOf(DOING); at !== -1; at = text.indexOf(DOING)) {
			const head = trimHead(text.slice(0, at));
			const tail = trimTail(text.slice(at + DOING.length));
			text = tail === "" ? head : `${head} ${tail}`;
		}
	}
	return text
		.replaceAll("{done}", String(counts.done))
		.replaceAll("{total}", String(counts.total))
		.replaceAll(DOING, String(counts.doing));
}

/** 永远按整张表算，与隐藏了多少条无关。 */
function countTasks(tasks: readonly Task[]): {
	done: number;
	total: number;
	doing: number;
} {
	const counts = { done: 0, total: tasks.length, doing: 0 };
	for (const task of tasks) {
		if (task.status === "completed") counts.done += 1;
		else if (task.status === "in_progress") counts.doing += 1;
	}
	return counts;
}

function renderRow(task: Task, glyphs: WidgetConfig["glyphs"]): string {
	const glyph =
		task.status === "completed"
			? glyphs.completed
			: task.status === "in_progress"
				? glyphs.inProgress
				: glyphs.pending;
	return `${glyph} ${task.content}`;
}

function layout(
	tasks: readonly Task[],
	budget: number,
): { shown: readonly Task[]; hidden: number } {
	if (tasks.length <= budget) return { shown: tasks, hidden: 0 };
	const unfinished = tasks.filter((task) => task.status !== "completed");
	const shown = unfinished.slice(0, Math.max(budget - 1, 0));
	return { shown, hidden: tasks.length - shown.length };
}

export function renderWidget(
	tasks: readonly Task[],
	cfg: WidgetConfig,
	width: number,
): string[] | undefined {
	if (tasks.length === 0) return undefined;

	const counts = countTasks(tasks);

	const visible = cfg.showCompleted
		? tasks
		: tasks.filter((task) => task.status !== "completed");
	const budget = cfg.maxLines - 1;
	const { shown, hidden } = layout(visible, budget);
	const lines = [
		renderHeader(cfg.header, counts),
		...shown.map((task) => renderRow(task, cfg.glyphs)),
	];
	// `maxLines` 是硬上限：预算连表头都装不下时，汇总行也一并丢掉
	if (hidden > 0 && budget > 0) lines.push(`+${hidden} more`);

	return lines.map((line, index) => {
		const text = truncate(line, width);
		return shown[index - 1]?.status === "completed" &&
			cfg.styleCompleted !== undefined
			? cfg.styleCompleted(text)
			: text;
	});
}

export function renderList(tasks: readonly Task[], cfg: WidgetConfig): string {
	return [
		renderHeader(cfg.header, countTasks(tasks)),
		...tasks.map((task) => renderRow(task, cfg.glyphs)),
	].join("\n");
}

export function toMarkdown(tasks: readonly Task[]): string {
	return tasks
		.map(
			(task) =>
				`- [${task.status === "completed" ? "x" : " "}] ${task.content}`,
		)
		.join("\n");
}

const CHECKLIST = /^\s*-\s*\[(.)\]\s*(.+)$/;

export function parseChecklist(text: string): Task[] {
	const tasks: Task[] = [];
	for (const line of text.split(/\r?\n/)) {
		const match = CHECKLIST.exec(line);
		if (match === null) continue;
		const content = (match[2] ?? "").trim();
		if (content === "") continue;
		const mark = match[1];
		tasks.push({
			content,
			status: mark === "x" || mark === "X" ? "completed" : "pending",
		});
	}
	return tasks;
}

function pad(value: number): string {
	return String(value).padStart(2, "0");
}

export function exportFileName(pattern: string, at: Date): string {
	const stamp = `${at.getFullYear()}${pad(at.getMonth() + 1)}${pad(at.getDate())}-${pad(at.getHours())}${pad(at.getMinutes())}`;
	return pattern.replaceAll("{timestamp}", stamp);
}
