import { describe, expect, it } from "vitest";
import { formatTasks, replayTasks, validateTasks } from "../src/plan.ts";

const LIMITS = { toolName: "todo", maxTasks: 20, maxContentChars: 120 };

function captureError(run: () => unknown): string {
	try {
		run();
	} catch (error) {
		return error instanceof Error ? error.message : String(error);
	}
	throw new Error("期望抛出错误，但调用成功返回");
}

describe("validateTasks", () => {
	it("空 content 被拒绝", () => {
		expect(
			captureError(() =>
				validateTasks(
					{ tasks: [{ content: "   ", status: "pending" }] },
					LIMITS,
				),
			),
		).toBe("todo: task 1: content is empty");
	});

	it("超长 content 被拒绝，报 trim 后的长度与真实上限", () => {
		expect(
			captureError(() =>
				validateTasks(
					{ tasks: [{ content: `${"x".repeat(121)}  `, status: "pending" }] },
					LIMITS,
				),
			),
		).toBe("todo: task 1: content is 121 chars, max is 120");
		expect(
			captureError(() =>
				validateTasks(
					{ tasks: [{ content: "hello world", status: "pending" }] },
					{ ...LIMITS, maxContentChars: 10 },
				),
			),
		).toBe("todo: task 1: content is 11 chars, max is 10");
	});

	it("超过条数上限被拒绝，报真实上限", () => {
		const task = { content: "x", status: "pending" };
		expect(
			captureError(() =>
				validateTasks(
					{ tasks: Array.from({ length: 21 }, () => ({ ...task })) },
					LIMITS,
				),
			),
		).toBe("todo: tasks has 21 items, max is 20");
		expect(
			captureError(() =>
				validateTasks(
					{ tasks: Array.from({ length: 6 }, () => ({ ...task })) },
					{ ...LIMITS, maxTasks: 5 },
				),
			),
		).toBe("todo: tasks has 6 items, max is 5");
	});

	it("requireSingleInProgress 为 true 时只允许一条 in_progress，报真实条数", () => {
		const twoDoing = {
			tasks: [
				{ content: "a", status: "in_progress" },
				{ content: "b", status: "in_progress" },
			],
		};

		expect(
			captureError(() =>
				validateTasks(twoDoing, { ...LIMITS, requireSingleInProgress: true }),
			),
		).toBe("todo: 2 tasks are in_progress, max is 1");
		expect(
			validateTasks(
				{
					tasks: [
						{ content: "a", status: "in_progress" },
						{ content: "b", status: "pending" },
					],
				},
				{ ...LIMITS, requireSingleInProgress: true },
			),
		).toEqual([
			{ content: "a", status: "in_progress" },
			{ content: "b", status: "pending" },
		]);
	});

	it("不传这个选项就按放开并行收：多条 in_progress 照收", () => {
		expect(
			validateTasks(
				{
					tasks: [
						{ content: "a", status: "in_progress" },
						{ content: "b", status: "in_progress" },
					],
				},
				LIMITS,
			),
		).toEqual([
			{ content: "a", status: "in_progress" },
			{ content: "b", status: "in_progress" },
		]);
	});

	it("非法 status 不参与 in_progress 计数", () => {
		const tasks = {
			tasks: [
				{ content: "a", status: "in_progress" },
				{ content: "b", status: "nope" },
			],
		};

		expect(
			captureError(() =>
				validateTasks(tasks, { ...LIMITS, requireSingleInProgress: true }),
			),
		).toBe(
			'todo: task 2: expected one of pending | in_progress | completed, got "nope"',
		);
	});

	it("非法 status 被拒绝", () => {
		expect(
			captureError(() =>
				validateTasks({ tasks: [{ content: "a", status: "done" }] }, LIMITS),
			),
		).toBe(
			'todo: task 1: expected one of pending | in_progress | completed, got "done"',
		);
		expect(
			captureError(() =>
				validateTasks({ tasks: [{ content: "a", status: 5 }] }, LIMITS),
			),
		).toBe(
			"todo: task 1: expected one of pending | in_progress | completed, got 5",
		);
		expect(
			captureError(() => validateTasks({ tasks: [{ content: "a" }] }, LIMITS)),
		).toBe(
			"todo: task 1: expected one of pending | in_progress | completed, got undefined",
		);
	});

	it("content 不是字符串被拒绝", () => {
		expect(
			captureError(() =>
				validateTasks({ tasks: [{ content: 5, status: "pending" }] }, LIMITS),
			),
		).toBe("todo: task 1: expected string, got 5");
	});

	it("item 不是对象被拒绝", () => {
		expect(
			captureError(() => validateTasks({ tasks: ["do it"] }, LIMITS)),
		).toBe('todo: task 1: expected object, got "do it"');
	});

	it("tasks 不是数组被拒绝", () => {
		expect(captureError(() => validateTasks({ tasks: 3 }, LIMITS))).toBe(
			"todo: tasks: expected array, got 3",
		);
		expect(captureError(() => validateTasks({ tasks: "a" }, LIMITS))).toBe(
			'todo: tasks: expected array, got "a"',
		);
		expect(captureError(() => validateTasks({}, LIMITS))).toBe(
			"todo: tasks: expected array, got undefined",
		);
	});

	it("入参不是对象被拒绝", () => {
		expect(captureError(() => validateTasks(null, LIMITS))).toBe(
			"todo: expected object, got null",
		);
		expect(
			captureError(() =>
				validateTasks([{ content: "a", status: "pending" }], LIMITS),
			),
		).toBe("todo: expected object, got array of 1");
	});

	it("报错带第几条：第三条超长就是 task 3", () => {
		const tasks = [
			{ content: "first", status: "completed" },
			{ content: "second", status: "in_progress" },
			{ content: "y".repeat(128), status: "pending" },
		];

		expect(captureError(() => validateTasks({ tasks }, LIMITS))).toBe(
			"todo: task 3: content is 128 chars, max is 120",
		);
	});

	it("多条违规一次列完，每条都带工具名前缀", () => {
		const tasks = [
			{ content: "  ", status: "pending" },
			{ content: "ok", status: "pending" },
			{ content: "ok", status: "done" },
		];

		expect(captureError(() => validateTasks({ tasks }, LIMITS))).toBe(
			[
				"todo: task 1: content is empty",
				'todo: task 3: expected one of pending | in_progress | completed, got "done"',
			].join("\n"),
		);
	});

	it("前缀取工具名，不写死 todo", () => {
		const message = captureError(() =>
			validateTasks(
				{ tasks: [{ content: "  ", status: "pending" }] },
				{ ...LIMITS, toolName: "plan" },
			),
		);

		expect(message.startsWith("plan: ")).toBe(true);
		expect(message).not.toContain("todo");
		expect(
			captureError(() =>
				validateTasks({ tasks: 3 }, { ...LIMITS, toolName: "plan" }),
			),
		).toBe("plan: tasks: expected array, got 3");
	});

	it("长度按 code point 计，emoji 算 1 个", () => {
		const content = "😀".repeat(120);

		expect(
			validateTasks({ tasks: [{ content, status: "pending" }] }, LIMITS),
		).toEqual([{ content, status: "pending" }]);
		expect(
			captureError(() =>
				validateTasks(
					{ tasks: [{ content: "😀".repeat(121), status: "pending" }] },
					LIMITS,
				),
			),
		).toBe("todo: task 1: content is 121 chars, max is 120");
	});

	it("超长字符串在报错里被截断，不回显全文", () => {
		const message = captureError(() =>
			validateTasks({ tasks: "z".repeat(5000) }, LIMITS),
		);

		expect(message).toBe(
			`todo: tasks: expected array, got ${JSON.stringify("z".repeat(32))}…`,
		);
		expect(message.length).toBeLessThan(100);
	});

	it("截断按 code point 切，不切出半个代理对", () => {
		expect(
			captureError(() =>
				validateTasks({ tasks: `a${"𠀋".repeat(20)}` }, LIMITS),
			),
		).toBe(
			`todo: tasks: expected array, got ${JSON.stringify(`a${"𠀋".repeat(20)}`)}`,
		);
		expect(
			captureError(() =>
				validateTasks({ tasks: `a${"𠀋".repeat(40)}` }, LIMITS),
			),
		).toBe(
			`todo: tasks: expected array, got ${JSON.stringify(`a${"𠀋".repeat(31)}`)}…`,
		);
	});

	it("未知键被拒绝，不静默剥离", () => {
		expect(
			captureError(() =>
				validateTasks(
					{ tasks: [{ content: "a", status: "pending" }], action: "add" },
					LIMITS,
				),
			),
		).toBe('todo: unknown key "action"');
		expect(
			captureError(() =>
				validateTasks(
					{ tasks: [{ content: "a", status: "pending", id: 7 }] },
					LIMITS,
				),
			),
		).toBe('todo: task 1: unknown key "id"');
		expect(
			captureError(() =>
				validateTasks(
					{
						tasks: [
							{ content: "a", status: "pending", activeForm: "x", id: 1 },
						],
						action: "add",
					},
					LIMITS,
				),
			),
		).toBe(
			[
				'todo: unknown key "action"',
				'todo: task 1: unknown key "activeForm"',
				'todo: task 1: unknown key "id"',
			].join("\n"),
		);
		expect(
			captureError(() => validateTasks({ tasks: 3, action: "add" }, LIMITS)),
		).toBe(
			['todo: unknown key "action"', "todo: tasks: expected array, got 3"].join(
				"\n",
			),
		);
	});

	it("返回 trim 过的新数组，不改入参", () => {
		const input = {
			tasks: [
				{ content: "  write tests  ", status: "in_progress" },
				{ content: "ship", status: "pending" },
			],
		};
		const tasks = validateTasks(input, LIMITS);

		expect(tasks).toEqual([
			{ content: "write tests", status: "in_progress" },
			{ content: "ship", status: "pending" },
		]);
		expect(tasks).not.toBe(input.tasks);
		expect(tasks[0]).not.toBe(input.tasks[0]);
		expect(input.tasks[0].content).toBe("  write tests  ");
	});

	it("空表合法，返回空数组", () => {
		const input = { tasks: [] };
		const tasks = validateTasks(input, LIMITS);

		expect(tasks).toEqual([]);
		expect(tasks).not.toBe(input.tasks);
	});

	it("trim 后正好等于上限算合法", () => {
		const tasks = validateTasks(
			{ tasks: [{ content: ` ${"x".repeat(120)}  `, status: "completed" }] },
			LIMITS,
		);

		expect(tasks).toEqual([{ content: "x".repeat(120), status: "completed" }]);
	});

	it("content 里的控制字符被拒绝，要求单行", () => {
		expect(
			captureError(() =>
				validateTasks(
					{ tasks: [{ content: "line1\nline2", status: "pending" }] },
					LIMITS,
				),
			),
		).toBe(
			"todo: task 1: content has a control character (U+000A); keep it one line",
		);
		expect(
			captureError(() =>
				validateTasks(
					{ tasks: [{ content: "a\tb", status: "pending" }] },
					LIMITS,
				),
			),
		).toBe(
			"todo: task 1: content has a control character (U+0009); keep it one line",
		);
		expect(
			captureError(() =>
				validateTasks(
					{ tasks: [{ content: "\u001b[31mred", status: "pending" }] },
					LIMITS,
				),
			),
		).toBe(
			"todo: task 1: content has a control character (U+001B); keep it one line",
		);
		expect(
			captureError(() =>
				validateTasks(
					{ tasks: [{ content: "a\u2028b", status: "pending" }] },
					LIMITS,
				),
			),
		).toBe(
			"todo: task 1: content has a line separator (U+2028); keep it one line",
		);
	});

	it("content 同时含控制字符又超长时两条都报", () => {
		expect(
			captureError(() =>
				validateTasks(
					{
						tasks: [
							{
								content: `${"x".repeat(100)}\n${"x".repeat(100)}`,
								status: "pending",
							},
						],
					},
					LIMITS,
				),
			),
		).toBe(
			[
				"todo: task 1: content has a control character (U+000A); keep it one line",
				"todo: task 1: content is 201 chars, max is 120",
			].join("\n"),
		);
	});

	it("不可见格式字符被拒绝：RLO / ZWSP / 软连字符 / BOM", () => {
		expect(
			captureError(() =>
				validateTasks(
					{ tasks: [{ content: "a\u202eb", status: "pending" }] },
					LIMITS,
				),
			),
		).toBe(
			"todo: task 1: content has an invisible character (U+202E); keep it plain text",
		);
		expect(
			captureError(() =>
				validateTasks(
					{ tasks: [{ content: "a\u200bb", status: "pending" }] },
					LIMITS,
				),
			),
		).toBe(
			"todo: task 1: content has an invisible character (U+200B); keep it plain text",
		);
		expect(
			captureError(() =>
				validateTasks(
					{ tasks: [{ content: "a\ufeffb", status: "pending" }] },
					LIMITS,
				),
			),
		).toBe(
			"todo: task 1: content has an invisible character (U+FEFF); keep it plain text",
		);
		// 首尾的 BOM 归 trim() 管（U+FEFF 是 JS 的空格），只有夹在中间的才落到这里
		expect(
			validateTasks(
				{ tasks: [{ content: " \ufeffa ", status: "pending" }] },
				LIMITS,
			),
		).toEqual([{ content: "a", status: "pending" }]);
		expect(
			captureError(() =>
				validateTasks(
					{ tasks: [{ content: "a\u00adb", status: "pending" }] },
					LIMITS,
				),
			),
		).toBe(
			"todo: task 1: content has an invisible character (U+00AD); keep it plain text",
		);
		expect(
			captureError(() =>
				validateTasks(
					{ tasks: [{ content: "a\u202ab", status: "pending" }] },
					LIMITS,
				),
			),
		).toBe(
			"todo: task 1: content has an invisible character (U+202A); keep it plain text",
		);
	});
});

describe("replayTasks", () => {
	it("快照里的控制字符压成空格，不丢整表", () => {
		const entries = [
			{
				type: "custom",
				customType: "pi-todo-state",
				data: { tasks: [{ content: "line1\nline2\t", status: "pending" }] },
			},
		];

		expect(replayTasks(entries)).toEqual([
			{ content: "line1 line2", status: "pending" },
		]);
	});

	it("快照里的转义序列整条丢掉，不留 [31m 残渣", () => {
		const entries = [
			{
				type: "custom",
				customType: "pi-todo-state",
				data: {
					tasks: [
						{ content: "\u001b[31mred\u0000x", status: "pending" },
						{ content: "\u001b]8;;https://x\u0007link", status: "pending" },
						{ content: "a\u202eb", status: "pending" },
					],
				},
			},
		];

		expect(replayTasks(entries)).toEqual([
			{ content: "red x", status: "pending" },
			{ content: "link", status: "pending" },
			{ content: "a b", status: "pending" },
		]);
	});

	it("取最后一条有效快照", () => {
		const entries = [
			{
				type: "custom",
				customType: "pi-todo-state",
				data: { tasks: [{ content: "旧", status: "pending" }] },
			},
			{ type: "message", role: "user" },
			{
				type: "custom",
				customType: "pi-todo-state",
				data: {
					tasks: [
						{ content: "新", status: "in_progress" },
						{ content: "二", status: "pending" },
					],
				},
			},
		];
		const tasks = replayTasks(entries);

		expect(tasks).toEqual([
			{ content: "新", status: "in_progress" },
			{ content: "二", status: "pending" },
		]);
		expect(tasks).not.toBe(
			(entries[2] as { data: { tasks: unknown } }).data.tasks,
		);
	});

	it("坏快照跳过，继续往前扫", () => {
		const good = {
			type: "custom",
			customType: "pi-todo-state",
			data: { tasks: [{ content: "好", status: "completed" }] },
		};
		const broken = [
			{ type: "custom", customType: "pi-todo-state" },
			{ type: "custom", customType: "pi-todo-state", data: null },
			{ type: "custom", customType: "pi-todo-state", data: { tasks: "x" } },
			{
				type: "custom",
				customType: "pi-todo-state",
				data: { tasks: [{ content: "a", status: "done" }] },
			},
			{
				type: "custom",
				customType: "pi-todo-state",
				data: { tasks: [{ content: "  ", status: "pending" }] },
			},
			{ type: "custom", customType: "pi-todo-state", data: { tasks: ["a"] } },
		];

		for (const entry of broken)
			expect(replayTasks([good, entry])).toEqual([
				{ content: "好", status: "completed" },
			]);
	});

	it("一条快照都没有时是空表", () => {
		expect(replayTasks([])).toEqual([]);
		expect(
			replayTasks([
				{ type: "message", role: "user" },
				{
					type: "custom",
					customType: "pi-other-state",
					data: { tasks: [{ content: "a", status: "pending" }] },
				},
			]),
		).toEqual([]);
	});

	it("只认 type: custom + customType: pi-todo-state，不读 toolResult 的 details", () => {
		const decoys = [
			{
				type: "message",
				role: "toolResult",
				details: { tasks: [{ content: "d", status: "pending" }] },
			},
			{
				type: "custom_message",
				customType: "pi-todo-state",
				content: "…",
				display: false,
				details: { tasks: [{ content: "d", status: "pending" }] },
			},
			{
				type: "custom",
				customType: "pi-todo-state-extra",
				data: { tasks: [{ content: "d", status: "pending" }] },
			},
		];
		const snapshot = {
			type: "custom",
			customType: "pi-todo-state",
			data: { tasks: [{ content: "真", status: "pending" }] },
		};

		for (const decoy of decoys) expect(replayTasks([decoy])).toEqual([]);
		expect(replayTasks([snapshot, ...decoys])).toEqual([
			{ content: "真", status: "pending" },
		]);
	});

	it("快照里多余字段丢掉，content trim 后带出", () => {
		const entries = [
			{
				type: "custom",
				customType: "pi-todo-state",
				data: {
					tasks: [
						{ content: " a ", status: "pending", id: 7, activeForm: "x" },
					],
				},
			},
		];

		expect(replayTasks(entries)).toEqual([{ content: "a", status: "pending" }]);
	});
});

describe("formatTasks", () => {
	it("空表只给一行 Todo 0/0", () => {
		expect(formatTasks([])).toBe("Todo 0/0");
	});

	it("非空表：一行进度 + 每项一行带字形", () => {
		const text = formatTasks([
			{ content: "write tests", status: "pending" },
			{ content: "implement", status: "in_progress" },
			{ content: "ship", status: "completed" },
		]);

		expect(text).toBe(
			[
				"Todo 1/3 · 1 doing",
				"[ ] write tests",
				"[-] implement",
				"[x] ship",
			].join("\n"),
		);
	});

	it("doing 为 0 时省略 · N doing", () => {
		const text = formatTasks([
			{ content: "a", status: "pending" },
			{ content: "b", status: "completed" },
		]);

		expect(text).toBe(["Todo 1/2", "[ ] a", "[x] b"].join("\n"));
	});
});
