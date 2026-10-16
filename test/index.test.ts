import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI, ExtensionContext, ExtensionToolContext, ToolDefinition } from "@earendil-works/pi-coding-agent";
import type { Component, TUI } from "@earendil-works/pi-tui";
import { afterEach, describe, expect, it, vi } from "vitest";
import piTodo from "../index.ts";
import { exportFileName } from "../view.ts";

const dirs: string[] = [];

/** 建一个随用例销毁的临时目录。 */
function makeTempDir(prefix: string): string {
	const dir = mkdtempSync(join(tmpdir(), `pi-todo-lite-${prefix}-`));
	dirs.push(dir);
	return dir;
}

/** 每个用例独立的 agent 目录：配置写在 `<dir>/pi-todo/config.json`，不碰真实 home。返回该目录。 */
function useConfig(config?: unknown): string {
	const dir = makeTempDir("index");
	if (config !== undefined) {
		mkdirSync(join(dir, "pi-todo"), { recursive: true });
		writeFileSync(join(dir, "pi-todo", "config.json"), JSON.stringify(config), "utf-8");
	}
	vi.stubEnv("PI_CODING_AGENT_DIR", dir);
	return dir;
}

afterEach(() => {
	vi.unstubAllEnvs();
	vi.restoreAllMocks();
	for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

type Handler = (event: unknown, ctx: ExtensionContext) => unknown;
type StateEntry = { type: string; customType: string; data?: unknown };
type WidgetCall = { key: string; content: unknown; options?: { placement?: string }; component?: Component };
type CommandOptions = { description?: string; handler: (args: string, ctx: ExtensionContext) => Promise<void> };
type CommandCall = { name: string; options: CommandOptions };
type Note = { message: string; type?: string };
type ShortcutOptions = { description?: string; handler: (ctx: ExtensionContext) => unknown };
type ShortcutCall = { key: string; options: ShortcutOptions };

interface Harness {
	api: ExtensionAPI;
	handlers: Map<string, Handler[]>;
	tools: ToolDefinition[];
	entries: StateEntry[];
	widgets: WidgetCall[];
	commands: CommandCall[];
	shortcuts: ShortcutCall[];
	notes: Note[];
	ctx: ExtensionContext;
	/** 累计 requestRender 次数。 */
	renders: () => number;
	/** 最近一次 setWidget 的组件按宽度渲染；没设过 widget 就是空表。 */
	lines: (width: number) => string[];
	/** 跑一次命令 handler（注册的第一个命令）。 */
	run: (args: string) => Promise<void>;
	/** 按一次快捷键（注册的第一个）。 */
	fireShortcut: () => Promise<void>;
}

/** fake api + fake ctx：只实现 index.ts 用到的那几样（registerTool / on / appendEntry / ui.setWidget / sessionManager.getBranch）。 */
function harness(options: { hasUI?: boolean; noSetWidget?: boolean; cwd?: string; theme?: unknown } = {}): Harness {
	const tools: ToolDefinition[] = [];
	const entries: StateEntry[] = [];
	const widgets: WidgetCall[] = [];
	const commands: CommandCall[] = [];
	const shortcuts: ShortcutCall[] = [];
	const notes: Note[] = [];
	const handlers = new Map<string, Handler[]>();
	let renders = 0;

	const tui = { requestRender: () => void (renders += 1) } as unknown as TUI;
	// 默认主题是恒等的：不关心样式的用例拿到的还是原文本
	const theme = options.theme ?? { strikethrough: (text: string) => text, style: (text: string) => text };
	const api = {
		registerTool: (tool: ToolDefinition) => void tools.push(tool),
		on: (event: string, handler: Handler) => {
			handlers.set(event, [...(handlers.get(event) ?? []), handler]);
			return () => {};
		},
		appendEntry: (customType: string, data?: unknown) => void entries.push({ type: "custom", customType, data }),
		registerCommand: (name: string, commandOptions: CommandOptions) => void commands.push({ name, options: commandOptions }),
		registerShortcut: (key: string, shortcutOptions: ShortcutOptions) => void shortcuts.push({ key, options: shortcutOptions }),
	} as unknown as ExtensionAPI;
	const ctx = {
		hasUI: options.hasUI ?? true,
		cwd: options.cwd ?? process.cwd(),
		ui: options.noSetWidget
			? {}
			: {
					setWidget: (key: string, content: unknown, widgetOptions?: { placement?: string }) => {
						const call: WidgetCall = { key, content, options: widgetOptions };
						if (typeof content === "function") call.component = (content as (tui: TUI, theme: unknown) => Component)(tui, theme);
						widgets.push(call);
					},
					notify: (message: string, type?: string) => void notes.push({ message, type }),
				},
		sessionManager: { getBranch: () => entries },
	} as unknown as ExtensionContext;

	const run = (args: string): Promise<void> => (commands[0] as CommandCall).options.handler(args, ctx as never);

	return {
		api,
		handlers,
		tools,
		entries,
		widgets,
		commands,
		shortcuts,
		notes,
		ctx,
		renders: () => renders,
		lines: (width) => widgets.at(-1)?.component?.render(width) ?? [],
		run,
		fireShortcut: async () => void (await shortcuts[0]?.options.handler(ctx as never)),
	};
}

/** 触发一个会话事件；index.ts 注册了 session_start / session_compact / session_tree。 */
function emit(harness: Harness, event: string): void {
	for (const handler of harness.handlers.get(event) ?? []) handler({ type: event }, harness.ctx);
}

/** 调一次工具；返回 index.ts 的返回值（校验失败就 reject）。 */
async function callTool(harness: Harness, params: unknown): Promise<{ content: Array<{ type: string; text: string }> }> {
	const tool = harness.tools[0] as ToolDefinition;
	const ctx = harness.ctx as ExtensionToolContext;
	return (await tool.execute("call-1", params as never, undefined, undefined, ctx)) as { content: Array<{ type: string; text: string }> };
}

/** 子命令认不出、参数给错时的用法提示（index.ts 的 USAGE）。 */
const USAGE = "Usage: /todos [clear | export | import <file>]";

/** 定稿 schema 的线上形状：比 prompt/my prompt new/schema.md 多一层 additionalProperties: false（见 docs/modules/plan.md）。 */
const SCHEMA = {
	type: "object",
	required: ["tasks"],
	properties: {
		tasks: {
			type: "array",
			items: {
				type: "object",
				required: ["content", "status"],
				properties: {
					content: { type: "string" },
					status: {
						anyOf: [
							{ type: "string", const: "pending" },
							{ type: "string", const: "in_progress" },
							{ type: "string", const: "completed" },
						],
					},
				},
				additionalProperties: false,
			},
		},
	},
	additionalProperties: false,
};

describe("index：注册（AC1）", () => {
	it("工具名取 tools.todo.name，sequential，label 是 Todo", () => {
		useConfig({ tools: { todo: { name: "tasklist" } } });
		const harnessed = harness();

		piTodo(harnessed.api);

		expect(harnessed.tools.map((tool) => tool.name)).toEqual(["tasklist"]);
		expect(harnessed.tools[0]?.executionMode).toBe("sequential");
		expect(harnessed.tools[0]?.label).toBe("Todo");
	});

	it("description / guidelines / schema 与定稿逐字一致", () => {
		useConfig();
		const harnessed = harness();

		piTodo(harnessed.api);

		const tool = harnessed.tools[0];
		expect(tool?.description).toBe("Keep a todo list for multi-step work.");
		expect(tool?.promptGuidelines).toEqual([
			"todo: Keep content short, one line, imperative.",
			"todo: Use for work with 3+ steps; when the whole plan is done, send `tasks: []` to clear.",
		]);
		expect(tool?.promptSnippet).toBeUndefined();
		expect(JSON.parse(JSON.stringify(tool?.parameters))).toEqual(SCHEMA);
	});

	it("guidelines 里的 tool-name: 替成配置里的工具名", () => {
		useConfig({ tools: { todo: { name: "tasklist" } } });
		const harnessed = harness();

		piTodo(harnessed.api);

		expect(harnessed.tools[0]?.promptGuidelines).toEqual([
			"tasklist: Keep content short, one line, imperative.",
			"tasklist: Use for work with 3+ steps; when the whole plan is done, send `tasks: []` to clear.",
		]);
	});

	it("一条 guideline 里写了多次 tool-name 时每处都替换", () => {
		useConfig({ guidance: { promptGuidelines: ["tool-name: a tool-name note"] } });
		const harnessed = harness();

		piTodo(harnessed.api);

		expect(harnessed.tools[0]?.promptGuidelines).toEqual(["todo: a todo note"]);
	});

	it("模型侧文案对得上 PLAN AC6 的定稿数：description 37 字符、guidelines 合计 136 字符", () => {
		useConfig();
		const harnessed = harness();

		piTodo(harnessed.api);

		const tool = harnessed.tools[0];
		expect(tool?.description?.length).toBe(37);
		expect(tool?.promptGuidelines?.join("").length).toBe(136);
		expect(tool?.promptGuidelines?.length).toBe(2);
	});

	it("description 与 guidelines 跟着配置走", () => {
		useConfig({ guidance: { description: "自定义描述", promptGuidelines: ["tool-name: 自定义一条"] } });
		const harnessed = harness();

		piTodo(harnessed.api);

		expect(harnessed.tools[0]?.description).toBe("自定义描述");
		expect(harnessed.tools[0]?.promptGuidelines).toEqual(["todo: 自定义一条"]);
	});
});

describe("index：一次调用（AC2）", () => {
	it("appendEntry 出一条 pi-todo-state，data.tasks 是校验后的 tasks（content 已 trim），返回值是 formatTasks 的文本", async () => {
		useConfig();
		const harnessed = harness();
		piTodo(harnessed.api);

		const result = await callTool(harnessed, { tasks: [{ content: "a", status: "pending" }] });

		expect(harnessed.entries).toEqual([{ type: "custom", customType: "pi-todo-state", data: { tasks: [{ content: "a", status: "pending" }] } }]);
		expect(result.content[0]?.text).toBe("Todo 0/1\n[ ] a");
	});

	it("plan.requireSingleInProgress: true 时两条 in_progress 被 plan.ts 拦下，不落账", async () => {
		useConfig({ plan: { requireSingleInProgress: true } });
		const harnessed = harness({ cwd: makeTempDir("cwd") });
		piTodo(harnessed.api);

		await expect(callTool(harnessed, { tasks: [{ content: "a", status: "in_progress" }, { content: "b", status: "in_progress" }] })).rejects.toThrow(
			"todo: 2 tasks are in_progress, max is 1",
		);
		expect(harnessed.entries).toEqual([]);
		expect(harnessed.widgets).toEqual([]);
	});

	it("ui.widget.completedStyle 决定已完成行怎么包：strikethrough / dim / plain", async () => {
		const tasks = [{ content: "a", status: "pending" }, { content: "b", status: "completed" }];
		const theme = {
			strikethrough: (text: string) => `~~${text}~~`,
			style: (text: string, options: { dim?: boolean }) => (options.dim ? `·${text}·` : text),
		};

		for (const [completedStyle, expected] of [
			["strikethrough", "~~[x] b~~"],
			["dim", "·[x] b·"],
			["plain", "[x] b"],
		] as const) {
			useConfig({ ui: { widget: { completedStyle } } });
			const harnessed = harness({ cwd: makeTempDir("cwd"), theme });
			piTodo(harnessed.api);
			emit(harnessed, "session_start");

			await callTool(harnessed, { tasks });

			expect(harnessed.lines(80)).toEqual(["Todo 1/2", "[ ] a", expected]);
		}
	});

	it("校验失败：抛出错误、不写 entry、不重画", async () => {
		useConfig();
		const harnessed = harness();
		piTodo(harnessed.api);
		emit(harnessed, "session_start");

		await expect(callTool(harnessed, { tasks: [{ content: " ", status: "pending" }] })).rejects.toThrow("todo: task 1: content is empty");

		expect(harnessed.entries).toEqual([]);
		expect(harnessed.renders()).toBe(0);
	});

	it("tasks: [] 清空表：entry 里是空表，widget 渲染成空", async () => {
		useConfig();
		const harnessed = harness();
		piTodo(harnessed.api);
		emit(harnessed, "session_start");
		await callTool(harnessed, { tasks: [{ content: "a", status: "pending" }] });
		expect(harnessed.lines(80)).toEqual(["Todo 0/1", "[ ] a"]);

		await callTool(harnessed, { tasks: [] });

		expect(harnessed.entries.at(-1)).toEqual({ type: "custom", customType: "pi-todo-state", data: { tasks: [] } });
		expect(harnessed.lines(80)).toEqual([]);
	});

	it("状态变化后重画一次 widget", async () => {
		useConfig();
		const harnessed = harness();
		piTodo(harnessed.api);
		emit(harnessed, "session_start");

		await callTool(harnessed, { tasks: [{ content: "a", status: "pending" }] });

		expect(harnessed.renders()).toBe(1);
	});
});

describe("index：会话事件与 widget（AC3）", () => {
	it("三个事件从空 entries 回放都不抛错", () => {
		useConfig();
		const harnessed = harness();
		piTodo(harnessed.api);

		for (const event of ["session_start", "session_compact", "session_tree"]) {
			expect(() => emit(harnessed, event)).not.toThrow();
		}

		expect(harnessed.widgets).toHaveLength(3);
		expect(harnessed.lines(80)).toEqual([]);
	});

	it("回放最后一条快照：session_tree 之后 widget 显示旧任务，placement 取配置", async () => {
		useConfig({ ui: { widget: { placement: "belowEditor" } } });
		const harnessed = harness();
		piTodo(harnessed.api);
		emit(harnessed, "session_start");
		await callTool(harnessed, { tasks: [{ content: "a", status: "pending" }, { content: "b", status: "completed" }] });

		emit(harnessed, "session_tree");

		expect(harnessed.lines(80)).toEqual(["Todo 1/2", "[ ] a", "[x] b"]);
		expect(harnessed.widgets.at(-1)?.options).toEqual({ placement: "belowEditor" });
	});

	it("widget.enabled 为 false 时不注册 widget，工具照常注册", () => {
		useConfig({ ui: { widget: { enabled: false } } });
		const harnessed = harness();
		piTodo(harnessed.api);

		expect(() => emit(harnessed, "session_start")).not.toThrow();

		expect(harnessed.widgets).toEqual([]);
		expect(harnessed.tools).toHaveLength(1);
	});

	it("没有 UI（hasUI 为 false 或缺 setWidget）时静默跳过", () => {
		useConfig();
		const noUI = harness({ hasUI: false });
		const noSetWidget = harness({ noSetWidget: true });

		piTodo(noUI.api);
		piTodo(noSetWidget.api);

		expect(() => emit(noUI, "session_start")).not.toThrow();
		expect(() => emit(noSetWidget, "session_start")).not.toThrow();

		expect(noUI.widgets).toEqual([]);
		expect(noSetWidget.widgets).toEqual([]);
	});
});

/** 20 条 pending，用来对「/todos 全列」与「widget 截断」两条口径。 */
function makeTasks(count: number): Array<{ content: string; status: string }> {
	return Array.from({ length: count }, (_, index) => ({ content: `task ${index + 1}`, status: "pending" }));
}

describe("index：lifecycle.onFinish（T12）", () => {
	it("fade：整表完成后 agent_settled 一到就收起；没全完成或空表都不动", async () => {
		useConfig({ lifecycle: { onFinish: "fade" } });
		const harnessed = harness({ cwd: makeTempDir("cwd") });
		piTodo(harnessed.api);
		emit(harnessed, "session_start");

		// 空表：不能把「还没开始」当「干完了」
		emit(harnessed, "agent_settled");
		expect(harnessed.lines(80)).toEqual([]);

		await callTool(harnessed, { tasks: [{ content: "a", status: "completed" }, { content: "b", status: "pending" }] });
		emit(harnessed, "agent_settled");
		expect(harnessed.lines(80)).toEqual(["Todo 1/2", "[x] a", "[ ] b"]);

		await callTool(harnessed, { tasks: [{ content: "a", status: "completed" }] });
		emit(harnessed, "agent_settled");
		expect(harnessed.widgets.at(-1)?.content).toBeUndefined();
		expect(harnessed.lines(80)).toEqual([]);
		expect(harnessed.entries).toHaveLength(2);
	});

	it("model / keep（默认 model）：压根不监听 agent_settled", async () => {
		for (const onFinish of [undefined, "keep"] as const) {
			useConfig(onFinish === undefined ? undefined : { lifecycle: { onFinish } });
			const harnessed = harness({ cwd: makeTempDir("cwd") });
			piTodo(harnessed.api);

			expect(harnessed.handlers.has("agent_settled")).toBe(false);
		}
	});
});

describe("index：折叠键（T11）", () => {
	it("按一次收起、再按一次展开：widget 消失又回来，任务表一寸不动", async () => {
		useConfig();
		const harnessed = harness({ cwd: makeTempDir("cwd") });
		piTodo(harnessed.api);
		await callTool(harnessed, { tasks: [{ content: "a", status: "pending" }, { content: "b", status: "completed" }] });

		expect(harnessed.shortcuts.map((call) => call.key)).toEqual(["alt+t"]);
		expect(harnessed.shortcuts[0]?.options.description).toBe("Toggle the todo widget");

		await harnessed.fireShortcut();

		expect(harnessed.widgets.at(-1)?.content).toBeUndefined();
		expect(harnessed.lines(80)).toEqual([]);
		expect(harnessed.entries).toHaveLength(1);
		expect(harnessed.entries[0]?.data).toEqual({ tasks: [{ content: "a", status: "pending" }, { content: "b", status: "completed" }] });

		await harnessed.fireShortcut();

		expect(harnessed.lines(80)).toEqual(["Todo 1/2", "[ ] a", "[x] b"]);
		expect(harnessed.entries).toHaveLength(1);
	});

	it("收起之后会话事件照旧回放，但 widget 保持收起", async () => {
		useConfig();
		const harnessed = harness({ cwd: makeTempDir("cwd") });
		piTodo(harnessed.api);
		await callTool(harnessed, { tasks: [{ content: "a", status: "pending" }] });
		await harnessed.fireShortcut();

		emit(harnessed, "session_compact");

		expect(harnessed.widgets.at(-1)?.content).toBeUndefined();
		expect(harnessed.lines(80)).toEqual([]);
		expect(harnessed.entries).toHaveLength(1);
	});

	it("配置成 off：压根不注册按键", async () => {
		useConfig({ ui: { shortcut: { toggle: "off" } } });
		const harnessed = harness({ cwd: makeTempDir("cwd") });
		piTodo(harnessed.api);

		expect(harnessed.shortcuts).toEqual([]);
	});
});

describe("index：/todos 命令（T8）", () => {
	it("注册命令 todos，带一句 description", () => {
		useConfig();
		const harnessed = harness();

		piTodo(harnessed.api);

		expect(harnessed.commands.map((command) => command.name)).toEqual(["todos"]);
		expect(harnessed.commands[0]?.options.description).toBe("Show or edit the todo list");
	});

	it("commands.todos.enabled 为 false 时不注册命令，工具与 widget 照常", () => {
		useConfig({ commands: { todos: { enabled: false } } });
		const harnessed = harness();

		piTodo(harnessed.api);
		emit(harnessed, "session_start");

		expect(harnessed.commands).toEqual([]);
		expect(harnessed.tools).toHaveLength(1);
		expect(harnessed.widgets).toHaveLength(1);
	});

	it("/todos：notify 出整张表，不截断不省条目（widget 仍按 maxLines 截断）", async () => {
		useConfig({ ui: { widget: { maxLines: 3 } } });
		const harnessed = harness();
		piTodo(harnessed.api);
		emit(harnessed, "session_start");
		await callTool(harnessed, { tasks: makeTasks(20) });

		await harnessed.run("");

		const note = harnessed.notes[0];
		const lines = note?.message.split("\n") ?? [];
		expect(note?.type).toBe("info");
		expect(lines).toHaveLength(21);
		expect(lines[0]).toBe("Todo 0/20");
		expect(lines[1]).toBe("[ ] task 1");
		expect(lines[20]).toBe("[ ] task 20");
		expect(harnessed.lines(80)).toHaveLength(3);
	});

	it("/todos clear：写一条空表账、widget 消失、notify 一句", async () => {
		useConfig();
		const harnessed = harness();
		piTodo(harnessed.api);
		emit(harnessed, "session_start");
		await callTool(harnessed, { tasks: [{ content: "a", status: "pending" }] });

		await harnessed.run("clear");

		expect(harnessed.entries.at(-1)).toEqual({ type: "custom", customType: "pi-todo-state", data: { tasks: [] } });
		expect(harnessed.lines(80)).toEqual([]);
		expect(harnessed.notes).toEqual([{ message: "Cleared", type: "info" }]);
	});

	it("不认识的子命令：warning 用法提示，不动状态", async () => {
		useConfig();
		const harnessed = harness();
		piTodo(harnessed.api);
		await callTool(harnessed, { tasks: [{ content: "a", status: "pending" }] });

		await harnessed.run("nope");

		expect(harnessed.notes).toEqual([{ message: "Usage: /todos [clear | export | import <file>]", type: "warning" }]);
		expect(harnessed.entries).toHaveLength(1);
	});

	it("ctx.ui 缺失（print / JSON / RPC）时不抛错，状态照旧落账", async () => {
		useConfig();
		const harnessed = harness({ noSetWidget: true });
		piTodo(harnessed.api);

		await expect(harnessed.run("")).resolves.toBeUndefined();
		await expect(harnessed.run("clear")).resolves.toBeUndefined();

		expect(harnessed.entries).toEqual([{ type: "custom", customType: "pi-todo-state", data: { tasks: [] } }]);
	});
});

describe("index：/todos export（T9）", () => {
	/** 只读 cwd 下的 md 文件：名字 → 内容。 */
	function exported(cwd: string): Array<[string, string]> {
		return readdirSync(cwd)
			.sort()
			.map((name) => [name, readFileSync(join(cwd, name), "utf-8")]);
	}

	it("写到 cwd，文件名带时间戳，内容是 toMarkdown，notify 带绝对路径", async () => {
		useConfig();
		const cwd = makeTempDir("cwd");
		const harnessed = harness({ cwd });
		piTodo(harnessed.api);
		await callTool(harnessed, { tasks: [{ content: "a", status: "pending" }, { content: "b", status: "completed" }] });

		await harnessed.run("export");

		const files = exported(cwd);
		expect(files).toHaveLength(1);
		const [name, text] = files[0] as [string, string];
		expect(name).toMatch(/^todo-\d{8}-\d{4}\.md$/);
		expect(text).toBe("- [ ] a\n- [x] b");
		expect(harnessed.notes).toEqual([{ message: `Exported 2 tasks to ${join(cwd, name)}`, type: "info" }]);
	});

	it("同名不覆盖：占住的名字让位（-2），旧文件原样留着", async () => {
		useConfig();
		const cwd = makeTempDir("cwd");
		const taken = exportFileName("todo-{timestamp}.md", new Date());
		writeFileSync(join(cwd, taken), "old", "utf-8");
		const harnessed = harness({ cwd });
		piTodo(harnessed.api);
		await callTool(harnessed, { tasks: [{ content: "a", status: "pending" }] });

		await harnessed.run("export");

		expect(readFileSync(join(cwd, taken), "utf-8")).toBe("old");
		const fresh = exported(cwd).filter(([name]) => name !== taken);
		expect(fresh).toHaveLength(1);
		expect((fresh[0] as [string, string])[1]).toBe("- [ ] a");
	});

	it("commands.export.dir 与 fileNamePattern 跟着配置走，目录不存在就建", async () => {
		useConfig({ commands: { export: { dir: join("out", "todo"), fileNamePattern: "list.md" } } });
		const cwd = makeTempDir("cwd");
		const harnessed = harness({ cwd });
		piTodo(harnessed.api);
		await callTool(harnessed, { tasks: [{ content: "a", status: "pending" }] });

		await harnessed.run("export");

		expect(readFileSync(join(cwd, "out", "todo", "list.md"), "utf-8")).toBe("- [ ] a");
		expect(harnessed.notes[0]?.message).toBe(`Exported 1 task to ${join(cwd, "out", "todo", "list.md")}`);
	});

	it("IO 失败只 notify error，不抛给宿主：目录位置已经是文件（EEXIST）", async () => {
		useConfig({ commands: { export: { dir: "occupied" } } });
		const cwd = makeTempDir("cwd");
		writeFileSync(join(cwd, "occupied"), "占位", "utf-8");
		const harnessed = harness({ cwd });
		piTodo(harnessed.api);

		await harnessed.run("export");

		expect(harnessed.notes).toHaveLength(1);
		expect(harnessed.notes[0]?.type).toBe("error");
		expect(harnessed.notes[0]?.message).toContain("EEXIST");
	});

	it("fileNamePattern 为空或带路径分隔符：error 提示，一个文件都不写（也不建目录）", async () => {
		for (const pattern of ["", "../escaped-{timestamp}.md", "sub/x-{timestamp}.md"]) {
			useConfig({ commands: { export: { fileNamePattern: pattern } } });
			const cwd = makeTempDir("cwd");
			const harnessed = harness({ cwd });
			piTodo(harnessed.api);

			await harnessed.run("export");

			expect(harnessed.notes).toEqual([{ message: `commands.export.fileNamePattern must be a file name, got "${pattern}"`, type: "error" }]);
			expect(readdirSync(cwd)).toEqual([]);
			// ../ 逃出去的文件、模板里写的子目录，都不该出现
			expect(readdirSync(join(cwd, "..")).filter((name) => name.startsWith("escaped-"))).toEqual([]);
			expect(existsSync(join(cwd, "sub"))).toBe(false);
		}
	});

	it("clear / export 多给参数：用法 warning，不动状态、不写文件", async () => {
		useConfig();
		const cwd = makeTempDir("cwd");
		const harnessed = harness({ cwd });
		piTodo(harnessed.api);
		await callTool(harnessed, { tasks: [{ content: "kept", status: "pending" }] });

		await harnessed.run("clear now please");
		await harnessed.run("export extra");

		expect(harnessed.notes).toEqual([{ message: USAGE, type: "warning" }, { message: USAGE, type: "warning" }]);
		expect(harnessed.entries).toHaveLength(1);
		expect(readdirSync(cwd)).toEqual([]);
	});

	it("commands.export.enabled 为 false：warning 提示，一个文件都不写", async () => {
		useConfig({ commands: { export: { enabled: false } } });
		const cwd = makeTempDir("cwd");
		const harnessed = harness({ cwd });
		piTodo(harnessed.api);

		await harnessed.run("export");

		expect(harnessed.notes).toEqual([{ message: "export is disabled (commands.export.enabled = false)", type: "warning" }]);
		expect(readdirSync(cwd)).toEqual([]);
	});
});

describe("index：/todos import（T10）", () => {
	it("T9 的产物原样读回：条数与状态一致，落账并重画", async () => {
		useConfig();
		const cwd = makeTempDir("cwd");
		const harnessed = harness({ cwd });
		piTodo(harnessed.api);
		emit(harnessed, "session_start");
		await callTool(harnessed, { tasks: [{ content: "a", status: "pending" }, { content: "b", status: "completed" }] });
		await harnessed.run("export");
		await harnessed.run("clear");
		const name = readdirSync(cwd)[0] as string;
		expect(harnessed.lines(80)).toEqual([]);

		await harnessed.run(`import ${name}`);

		expect(harnessed.entries.at(-1)).toEqual({
			type: "custom",
			customType: "pi-todo-state",
			data: { tasks: [{ content: "a", status: "pending" }, { content: "b", status: "completed" }] },
		});
		expect(harnessed.notes.at(-1)).toEqual({ message: `Imported 2 tasks from ${join(cwd, name)}`, type: "info" });
		expect(harnessed.lines(80)).toEqual(["Todo 1/2", "[ ] a", "[x] b"]);
	});

	it("表非空时拒绝：warning，不动现有表", async () => {
		useConfig();
		const cwd = makeTempDir("cwd");
		writeFileSync(join(cwd, "in.md"), "- [ ] x\n", "utf-8");
		const harnessed = harness({ cwd });
		piTodo(harnessed.api);
		await callTool(harnessed, { tasks: [{ content: "kept", status: "pending" }] });

		await harnessed.run("import in.md");

		expect(harnessed.notes).toEqual([{ message: "Table is not empty. Run /todos clear first.", type: "warning" }]);
		expect(harnessed.entries).toHaveLength(1);
		expect(harnessed.entries[0]?.data).toEqual({ tasks: [{ content: "kept", status: "pending" }] });
	});

	it("不认识的行忽略；超上限（21 条）时报 plan.ts 的消息且不落账", async () => {
		useConfig();
		const cwd = makeTempDir("cwd");
		writeFileSync(join(cwd, "mixed.md"), `# 标题\n随便一句话\n- [ ] a\n- [x] b\n`, "utf-8");
		writeFileSync(join(cwd, "too-many.md"), Array.from({ length: 21 }, (_, index) => `- [ ] task ${index + 1}`).join("\n"), "utf-8");
		const harnessed = harness({ cwd });
		piTodo(harnessed.api);

		await harnessed.run("import mixed.md");
		await harnessed.run("clear");
		await harnessed.run("import too-many.md");

		expect(harnessed.entries.at(-2)?.data).toEqual({
			tasks: [{ content: "a", status: "pending" }, { content: "b", status: "completed" }],
		});
		expect(harnessed.notes.at(-1)).toEqual({ message: "todo: tasks has 21 items, max is 20", type: "error" });
		expect(harnessed.entries.at(-1)?.data).toEqual({ tasks: [] });
	});

	it("文件读不到：error 提示，不落账", async () => {
		useConfig();
		const cwd = makeTempDir("cwd");
		const harnessed = harness({ cwd });
		piTodo(harnessed.api);

		await harnessed.run("import nope.md");

		expect(harnessed.notes[0]?.type).toBe("error");
		expect(harnessed.notes[0]?.message).toContain(`Cannot read ${join(cwd, "nope.md")}`);
		expect(harnessed.entries).toEqual([]);
	});

	it("路径里的连续空格是路径的一部分，配对引号会被剥掉", async () => {
		useConfig();
		const cwd = makeTempDir("cwd");
		writeFileSync(join(cwd, "a  b.md"), "- [ ] 双空格\n", "utf-8");
		const harnessed = harness({ cwd });
		piTodo(harnessed.api);

		await harnessed.run("import a  b.md");

		expect(harnessed.notes.at(-1)).toEqual({ message: `Imported 1 task from ${join(cwd, "a  b.md")}`, type: "info" });
		expect(harnessed.entries.at(-1)?.data).toEqual({ tasks: [{ content: "双空格", status: "pending" }] });

		await harnessed.run("clear");
		await harnessed.run('import "a  b.md"');

		expect(harnessed.notes.at(-1)).toEqual({ message: `Imported 1 task from ${join(cwd, "a  b.md")}`, type: "info" });
	});

	it("缺文件名 / import 关掉：warning，不落账", async () => {
		useConfig({ commands: { import: { enabled: false } } });
		const cwd = makeTempDir("cwd");
		writeFileSync(join(cwd, "in.md"), "- [ ] x\n", "utf-8");
		const off = harness({ cwd });
		piTodo(off.api);

		await off.run("import in.md");
		expect(off.notes).toEqual([{ message: "import is disabled (commands.import.enabled = false)", type: "warning" }]);

		useConfig();
		const on = harness({ cwd });
		piTodo(on.api);

		await on.run("import");

		expect(on.notes).toEqual([{ message: USAGE, type: "warning" }]);
		expect(off.entries).toEqual([]);
		expect(on.entries).toEqual([]);
	});
});
