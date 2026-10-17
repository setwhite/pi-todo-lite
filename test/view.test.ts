import { describe, expect, it } from "vitest";
import type { Status, Task } from "../src/plan.ts";
import { exportFileName, parseChecklist, renderList, renderWidget, toMarkdown, type WidgetConfig } from "../src/view.ts";

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

describe("renderWidget：已完成行的样式钩子", () => {
	const mixed: Task[] = [
		{ content: "a", status: "pending" },
		{ content: "b", status: "in_progress" },
		{ content: "c", status: "completed" },
	];

	it("只套在已完成的行上，而且是先截断再套（宽度按没套样式前算）", () => {
		const cfg = { ...CFG, styleCompleted: (text: string) => `<${text}>` };

		expect(renderWidget(mixed, cfg, 80)).toEqual(["Todo 1/3 · 1 doing", "[ ] a", "[-] b", "<[x] c>"]);
		expect(renderWidget([{ content: "a very long completed task", status: "completed" }], cfg, 10)).toEqual(["Todo 1/1", "<[x] a ver…>"]);
	});

	it("不传这个钩子就原样输出", () => {
		expect(renderWidget(mixed, CFG, 80)).toEqual(["Todo 1/3 · 1 doing", "[ ] a", "[-] b", "[x] c"]);
	});

	it("没有完成行时钩子一次都不调用；renderList（notify 纯文本）也不用它", () => {
		const calls: string[] = [];
		const cfg = { ...CFG, showCompleted: false, styleCompleted: (text: string) => (calls.push(text), text) };

		expect(renderWidget(mixed, cfg, 80)).toEqual(["Todo 1/3 · 1 doing", "[ ] a", "[-] b"]);
		expect(renderList(mixed, cfg)).toBe("Todo 1/3 · 1 doing\n[ ] a\n[-] b\n[x] c");
		expect(calls).toEqual([]);
	});
});

describe("renderList", () => {
	it("全列：20 条、maxLines 为 3 也一条不少，末尾没有 +N more", () => {
		const lines = renderList(makeTasks(20, "pending"), { ...CFG, maxLines: 3 }).split("\n");

		expect(lines).toHaveLength(21);
		expect(lines[0]).toBe("Todo 0/20");
		expect(lines[1]).toBe("[ ] task 1");
		expect(lines[20]).toBe("[ ] task 20");
	});

	it("空表只有表头", () => {
		expect(renderList([], CFG)).toBe("Todo 0/0");
	});

	it("表头与条目用法同 renderWidget：doing 为 0 省段、字形取配置", () => {
		const tasks: Task[] = [
			{ content: "a", status: "pending" },
			{ content: "b", status: "in_progress" },
			{ content: "c", status: "completed" },
		];

		expect(renderList(tasks, CFG)).toBe("Todo 1/3 · 1 doing\n[ ] a\n[-] b\n[x] c");
		expect(renderList(tasks, { ...CFG, header: "{done}/{total} 完成 · {doing} 进行中 ({nope})" })).toBe("1/3 完成 · 1 进行中 ({nope})\n[ ] a\n[-] b\n[x] c");
		expect(renderList(tasks, { ...CFG, glyphs: { pending: "·", inProgress: ">", completed: "✓" } })).toBe("Todo 1/3 · 1 doing\n· a\n> b\n✓ c");
	});

	it("completed 也逐条列出，showCompleted: false 不影响（清单是全列）", () => {
		const tasks: Task[] = [
			{ content: "done", status: "completed" },
			{ content: "todo", status: "pending" },
		];

		expect(renderList(tasks, { ...CFG, showCompleted: false })).toBe("Todo 1/2\n[x] done\n[ ] todo");
	});

	it("不按宽度截断：长行原样给出", () => {
		const long = "x".repeat(200);

		expect(renderList([{ content: long, status: "pending" }], CFG)).toBe(`Todo 0/1\n[ ] ${long}`);
	});
});

describe("toMarkdown", () => {
	it("只有 - [ ] 与 - [x] 两种行，in_progress 归到未勾选", () => {
		const tasks: Task[] = [
			{ content: "a", status: "pending" },
			{ content: "b", status: "in_progress" },
			{ content: "c", status: "completed" },
		];

		expect(toMarkdown(tasks)).toBe("- [ ] a\n- [ ] b\n- [x] c");
	});

	it("空表给空串，没有头尾多余字符", () => {
		expect(toMarkdown([])).toBe("");
	});

	it("顺序与 content 原样保留", () => {
		expect(toMarkdown([{ content: "a  b", status: "completed" }])).toBe("- [x] a  b");
	});
});

describe("exportFileName", () => {
	it("{timestamp} 替成 YYYYMMDD-HHmm（本地时间）", () => {
		expect(exportFileName("todo-{timestamp}.md", new Date(2026, 9, 16, 10, 30))).toBe("todo-20261016-1030.md");
	});

	it("月/日/时/分个位数补零", () => {
		expect(exportFileName("{timestamp}", new Date(2026, 0, 2, 3, 4))).toBe("20260102-0304");
	});

	it("模板里写几次就替几次；没写占位符就原样返回", () => {
		const at = new Date(2026, 9, 16, 10, 30);

		expect(exportFileName("{timestamp}-{timestamp}.md", at)).toBe("20261016-1030-20261016-1030.md");
		expect(exportFileName("todo.md", at)).toBe("todo.md");
	});
});

describe("parseChecklist", () => {
	it("读回 toMarkdown 的产物：条数与状态一致（in_progress 只能退成 pending）", () => {
		const tasks: Task[] = [
			{ content: "a", status: "pending" },
			{ content: "b", status: "completed" },
		];

		expect(parseChecklist(toMarkdown(tasks))).toEqual(tasks);
		expect(parseChecklist(toMarkdown([{ content: "wip", status: "in_progress" }]))).toEqual([{ content: "wip", status: "pending" }]);
	});

	it("[X] 也算完成，其余勾选态算未完成", () => {
		expect(parseChecklist("- [X] a\n- [-] b\n- [.] c")).toEqual([
			{ content: "a", status: "completed" },
			{ content: "b", status: "pending" },
			{ content: "c", status: "pending" },
		]);
	});

	it("不认识的行一律忽略：标题、普通文本、没有勾选框的列表项", () => {
		expect(parseChecklist("# 清单\n\n随便一句话\n- 没有勾选框\n- [ ] a\n\n> 引用")).toEqual([{ content: "a", status: "pending" }]);
	});

	it("行首允许空白，content 两端 trim；勾选框后没内容的行忽略", () => {
		expect(parseChecklist("  - [ ]\t  spaced  \n- [x]\n- [ ]\t")).toEqual([{ content: "spaced", status: "pending" }]);
	});

	it("CRLF 与空文本", () => {
		expect(parseChecklist("- [ ] a\r\n- [x] b\r\n")).toEqual([
			{ content: "a", status: "pending" },
			{ content: "b", status: "completed" },
		]);
		expect(parseChecklist("")).toEqual([]);
	});
});
