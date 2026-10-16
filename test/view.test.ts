import { describe, expect, it } from "vitest";
import type { Status, Task } from "../plan.ts";
import { renderWidget, type WidgetConfig } from "../view.ts";

const CFG: WidgetConfig = {
	maxLines: 9,
	header: "Todo {done}/{total} · {doing} doing",
	glyphs: { pending: "[ ]", inProgress: "[-]", completed: "[x]" },
	showCompleted: true,
	placement: "aboveEditor",
};

/** 造 count 条任务，content 里带序号便于对账。 */
function makeTasks(count: number, status: Status): Task[] {
	return Array.from({ length: count }, (_, index) => ({ content: `task ${index + 1}`, status }));
}

/** 只有代理对、没有孤立代理字符时为 true。 */
function hasLoneSurrogate(text: string): boolean {
	return /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(text);
}

describe("renderWidget", () => {
	it("空表返回 undefined，widget 消失", () => {
		expect(renderWidget([], CFG, 80)).toBeUndefined();
	});

	it("一条任务：表头一行 + 条目一行", () => {
		expect(renderWidget([{ content: "write tests", status: "pending" }], CFG, 80)).toEqual(["Todo 0/1", "[ ] write tests"]);
	});

	it("doing 不为 0 时表头带 · N doing，为 0 时整段省略", () => {
		const mixed = [{ content: "a", status: "in_progress" as Status }, { content: "b", status: "pending" as Status }, { content: "c", status: "completed" as Status }];

		expect(renderWidget(mixed, CFG, 80)?.[0]).toBe("Todo 1/3 · 1 doing");
		expect(renderWidget(makeTasks(3, "pending"), CFG, 80)?.[0]).toBe("Todo 0/3");
	});

	it("表头模板替换三个占位符，认不出的占位符当普通文本", () => {
		const tasks = [{ content: "a", status: "pending" as Status }, { content: "b", status: "completed" as Status }];
		const cfg = { ...CFG, header: "{done}/{total} 完成 · {doing} 进行中 ({nope})" };

		expect(renderWidget(tasks, cfg, 80)?.[0]).toBe("1/2 完成 ({nope})");
		expect(renderWidget(tasks, { ...CFG, header: "Todo {done}/{total} ({nope})" }, 80)?.[0]).toBe("Todo 1/2 ({nope})");
	});

	it("20 条 × 宽度 40 / 80 / 120：行数卡在 maxLines 内，末尾是 +N more", () => {
		const tasks = makeTasks(20, "pending");

		for (const width of [40, 80, 120]) {
			const lines = renderWidget(tasks, CFG, width) ?? [];
			expect(lines).toHaveLength(9);
			expect(lines.every((line) => Array.from(line).length <= width)).toBe(true);
			expect(lines[lines.length - 1]).toBe("+13 more");
			expect(lines[1]).toBe("[ ] task 1");
		}
	});

	it("放不下的行按 code point 截断，省略号是 …", () => {
		const lines = renderWidget([{ content: "x".repeat(60), status: "pending" }], CFG, 40);

		expect(lines).toEqual(["Todo 0/1", `[ ] ${"x".repeat(35)}…`]);
		expect(Array.from(lines?.[1] ?? "").length).toBe(40);
	});

	it("截断不切出半个代理对", () => {
		const line = renderWidget([{ content: "𠀋".repeat(40), status: "pending" }], CFG, 40)?.[1] ?? "";

		expect(Array.from(line).length).toBe(40);
		expect(line.endsWith("…")).toBe(true);
		expect(hasLoneSurrogate(line)).toBe(false);
	});

	it("表头也按宽度截断", () => {
		expect(renderWidget([{ content: "a", status: "pending" }], CFG, 5)).toEqual(["Todo…", "[ ] a"]);
	});

	it("宽度为 0 时给空行，不抛错", () => {
		expect(renderWidget([{ content: "a", status: "pending" }], CFG, 0)).toEqual(["", ""]);
	});

	it("正好装满预算时不出 +N more", () => {
		expect(renderWidget(makeTasks(20, "pending"), { ...CFG, maxLines: 21 }, 80)).toHaveLength(21);
		expect(renderWidget(makeTasks(21, "pending"), { ...CFG, maxLines: 21 }, 80)?.at(-1)).toBe("+2 more");
	});

	it("超预算先整条丢 completed", () => {
		const tasks = [...makeTasks(3, "completed"), { content: "还剩这件", status: "pending" as Status }];

		expect(renderWidget(tasks, { ...CFG, maxLines: 4 }, 80)).toEqual(["Todo 3/4", "[ ] 还剩这件", "+3 more"]);
	});

	it("非完成项也超预算时砍尾巴，隐藏数把 completed 一起算上", () => {
		const tasks = [...makeTasks(8, "completed"), ...makeTasks(20, "pending")];
		const lines = renderWidget(tasks, CFG, 80) ?? [];

		expect(lines).toHaveLength(9);
		expect(lines[1]).toBe("[ ] task 1");
		expect(lines[lines.length - 1]).toBe("+21 more");
		expect(lines.some((line) => line.startsWith("[x]"))).toBe(false);
	});

	it("maxLines 为 3 时只剩表头 + 一行 + 汇总", () => {
		expect(renderWidget(makeTasks(20, "pending"), { ...CFG, maxLines: 3 }, 80)).toEqual(["Todo 0/20", "[ ] task 1", "+19 more"]);
	});

	it("showCompleted 为 false 时 completed 只进表头计数", () => {
		const tasks = [{ content: "done", status: "completed" as Status }, { content: "todo", status: "pending" as Status }];

		expect(renderWidget(tasks, { ...CFG, showCompleted: false }, 80)).toEqual(["Todo 1/2", "[ ] todo"]);
		expect(renderWidget(tasks, CFG, 80)).toEqual(["Todo 1/2", "[x] done", "[ ] todo"]);
	});

	it("字形取配置里的三态符号", () => {
		const tasks = [{ content: "a", status: "pending" as Status }, { content: "b", status: "in_progress" as Status }];
		const cfg = { ...CFG, glyphs: { pending: "·", inProgress: ">", completed: "✓" } };

		expect(renderWidget(tasks, cfg, 80)).toEqual(["Todo 0/2 · 1 doing", "· a", "> b"]);
	});
	it("模板里有多个 {doing} 时每个都按同一套处理", () => {
		const tasks = [{ content: "a", status: "in_progress" as Status }, { content: "b", status: "completed" as Status }];
		const twice = { ...CFG, header: "Todo {done}/{total} · {doing} doing · {doing} doing" };

		expect(renderWidget(tasks, twice, 80)?.[0]).toBe("Todo 1/2 · 1 doing · 1 doing");
		expect(renderWidget(tasks.map((task) => ({ ...task, status: "pending" as Status })), twice, 80)?.[0]).toBe("Todo 0/2");
	});

	it("maxLines 为 1 时只剩表头，汇总行也不出", () => {
		expect(renderWidget(makeTasks(2, "pending"), { ...CFG, maxLines: 1 }, 80)).toEqual(["Todo 0/2"]);
		expect(renderWidget(makeTasks(2, "pending"), { ...CFG, maxLines: 2 }, 80)).toEqual(["Todo 0/2", "+2 more"]);
	});
});
