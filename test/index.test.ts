import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI, ExtensionContext, ExtensionToolContext, ToolDefinition } from "@earendil-works/pi-coding-agent";
import type { Component, TUI } from "@earendil-works/pi-tui";
import { afterEach, describe, expect, it, vi } from "vitest";
import piTodo from "../index.ts";

const dirs: string[] = [];

/** 每个用例独立的 agent 目录：配置写在 `<dir>/pi-todo/config.json`，不碰真实 home。 */
function useConfig(config?: unknown): void {
	const dir = mkdtempSync(join(tmpdir(), "pi-todo-lite-index-"));
	dirs.push(dir);
	if (config !== undefined) {
		mkdirSync(join(dir, "pi-todo"), { recursive: true });
		writeFileSync(join(dir, "pi-todo", "config.json"), JSON.stringify(config), "utf-8");
	}
	vi.stubEnv("PI_CODING_AGENT_DIR", dir);
}

afterEach(() => {
	vi.unstubAllEnvs();
	vi.restoreAllMocks();
	for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

type Handler = (event: unknown, ctx: ExtensionContext) => unknown;
type StateEntry = { type: string; customType: string; data?: unknown };
type WidgetCall = { key: string; content: unknown; options?: { placement?: string }; component?: Component };

interface Harness {
	api: ExtensionAPI;
	handlers: Map<string, Handler[]>;
	tools: ToolDefinition[];
	entries: StateEntry[];
	widgets: WidgetCall[];
	ctx: ExtensionContext;
	/** 累计 requestRender 次数。 */
	renders: () => number;
	/** 最近一次 setWidget 的组件按宽度渲染；没设过 widget 就是空表。 */
	lines: (width: number) => string[];
}

/** fake api + fake ctx：只实现 index.ts 用到的那几样（registerTool / on / appendEntry / ui.setWidget / sessionManager.getBranch）。 */
function harness(options: { hasUI?: boolean; noSetWidget?: boolean } = {}): Harness {
	const tools: ToolDefinition[] = [];
	const entries: StateEntry[] = [];
	const widgets: WidgetCall[] = [];
	const handlers = new Map<string, Handler[]>();
	let renders = 0;

	const tui = { requestRender: () => void (renders += 1) } as unknown as TUI;
	const api = {
		registerTool: (tool: ToolDefinition) => void tools.push(tool),
		on: (event: string, handler: Handler) => {
			handlers.set(event, [...(handlers.get(event) ?? []), handler]);
			return () => {};
		},
		appendEntry: (customType: string, data?: unknown) => void entries.push({ type: "custom", customType, data }),
	} as unknown as ExtensionAPI;
	const ctx = {
		hasUI: options.hasUI ?? true,
		ui: options.noSetWidget
			? {}
			: {
					setWidget: (key: string, content: unknown, widgetOptions?: { placement?: string }) => {
						const call: WidgetCall = { key, content, options: widgetOptions };
						if (typeof content === "function") call.component = (content as (tui: TUI, theme: unknown) => Component)(tui, {});
						widgets.push(call);
					},
				},
		sessionManager: { getBranch: () => entries },
	} as unknown as ExtensionContext;

	return { api, handlers, tools, entries, widgets, ctx, renders: () => renders, lines: (width) => widgets.at(-1)?.component?.render(width) ?? [] };
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
