import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import type {
	ExtensionAPI,
	ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import type { Component, KeyId, TUI } from "@earendil-works/pi-tui";
import { Type } from "typebox";
import { type Config, loadConfig } from "./config.ts";
import {
	formatTasks,
	replayTasks,
	STATE_CUSTOM_TYPE,
	type Task,
	validateTasks,
} from "./plan.ts";
import {
	exportFileName,
	parseChecklist,
	renderList,
	renderWidget,
	toMarkdown,
	type WidgetConfig,
} from "./view.ts";

const WIDGET_KEY = "todo";

const COMMAND_NAME = "todos";

const EXPORT_NAME_ATTEMPTS = 100;

const USAGE = `Usage: /${COMMAND_NAME} [clear | export | import <file>]`;

function exportDir(cwd: string, dir: string): string {
	return dir === "" ? cwd : resolve(cwd, dir);
}

function assertPlainName(name: string, pattern: string): void {
	if (name === "" || name === "." || name === ".." || /[\\/]/.test(name)) {
		throw new Error(
			`commands.export.fileNamePattern must be a file name, got "${pattern}"`,
		);
	}
}

/** 用户给带空格的路径时会加引号。 */
function stripQuotes(value: string): string {
	const quote = value[0];
	if (
		value.length >= 2 &&
		(quote === '"' || quote === "'") &&
		value.endsWith(quote)
	)
		return value.slice(1, -1).trim();
	return value;
}

function writeExportFile(
	cwd: string,
	dir: string,
	pattern: string,
	text: string,
): string {
	const target = exportDir(cwd, dir);
	const name = exportFileName(pattern, new Date());
	// 先判名字：模板写坏时别为一个注定失败的名字建目录
	assertPlainName(name, pattern);
	mkdirSync(target, { recursive: true });

	const dot = name.lastIndexOf(".");
	const stem = dot === -1 ? name : name.slice(0, dot);
	const suffix = dot === -1 ? "" : name.slice(dot);

	for (let attempt = 1; attempt <= EXPORT_NAME_ATTEMPTS; attempt += 1) {
		const path = join(
			target,
			attempt === 1 ? name : `${stem}-${attempt}${suffix}`,
		);
		try {
			// wx：文件已存在就抛 EEXIST，不覆盖别人的东西
			writeFileSync(path, text, { encoding: "utf-8", flag: "wx" });
			return path;
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
		}
	}

	throw new Error(`pi-todo: no free file name for ${name} in ${target}`);
}

const TOOL_NAME_PLACEHOLDER = "tool-name";

const CLEAR_HINT_MARK = "`tasks: []`";

export default function piTodo(pi: ExtensionAPI): void {
	const config = loadConfig();
	const toolName = config.tools.todo.name;
	const widgetConfig: WidgetConfig = {
		maxLines: config.ui.widget.maxLines,
		header: config.ui.widget.header,
		glyphs: config.ui.widget.glyphs,
		showCompleted: config.ui.widget.showCompleted,
		placement: config.ui.widget.placement,
	};
	/** 只经 commit / restore 改变；widget 每次 render 读它。 */
	let tasks: Task[] = [];
	let tui: TUI | undefined;

	/** 只切视图，不碰账。 */
	let collapsed = false;

	/** 结构化类型，省得 import pi 内部的 Theme。 */
	type StyleTheme = {
		strikethrough(text: string): string;
		style(text: string, options: { dim?: boolean }): string;
	};

	const styleCompleted = (
		theme: StyleTheme,
		style: Config["ui"]["widget"]["completedStyle"],
	): ((text: string) => string) => {
		if (style === "plain") return (text) => text;
		if (style === "strikethrough") return (text) => theme.strikethrough(text);
		return (text) => theme.style(text, { dim: true });
	};

	/** 只读 live 状态、不缓存，所以 invalidate 空转。 */
	const widget = (theme: StyleTheme): Component & { dispose?(): void } => {
		const lineStyle = styleCompleted(theme, config.ui.widget.completedStyle);
		return {
			render: (width: number) =>
				renderWidget(
					tasks,
					{ ...widgetConfig, styleCompleted: lineStyle },
					width,
				) ?? [],
			invalidate: () => {},
		};
	};

	const draw = (ctx: ExtensionContext): void => {
		if (
			!config.ui.widget.enabled ||
			!ctx.hasUI ||
			typeof ctx.ui?.setWidget !== "function"
		)
			return;
		if (collapsed) {
			ctx.ui.setWidget(WIDGET_KEY, undefined);
			return;
		}
		ctx.ui.setWidget(
			WIDGET_KEY,
			(handle, theme) => {
				tui = handle;
				return widget(theme);
			},
			{ placement: widgetConfig.placement },
		);
	};

	const commit = (next: Task[]): void => {
		pi.appendEntry(STATE_CUSTOM_TYPE, { tasks: next });
		tasks = next;
		tui?.requestRender();
	};

	const notify = (
		ctx: ExtensionContext,
		message: string,
		type: "info" | "warning" | "error",
	): void => {
		if (typeof ctx.ui?.notify !== "function") return;
		ctx.ui.notify(message, type);
	};

	const restore = (ctx: ExtensionContext): void => {
		tasks = replayTasks(ctx.sessionManager.getBranch());
		draw(ctx);
	};

	pi.registerTool({
		name: toolName,
		label: "Todo",
		description: config.guidance.description,
		promptSnippet: config.guidance.promptSnippet || undefined,
		promptGuidelines: config.guidance.promptGuidelines
			.filter(
				(guideline) =>
					config.lifecycle.onFinish === "model" ||
					!guideline.includes(CLEAR_HINT_MARK),
			)
			.map((guideline) =>
				guideline.replaceAll(TOOL_NAME_PLACEHOLDER, toolName),
			),
		// additionalProperties: false 与 plan.ts 的未知键拒绝同一件事
		parameters: Type.Object(
			{
				tasks: Type.Array(
					Type.Object(
						{
							content: Type.String(),
							status: Type.Union([
								Type.Literal("pending"),
								Type.Literal("in_progress"),
								Type.Literal("completed"),
							]),
						},
						{ additionalProperties: false },
					),
				),
			},
			{ additionalProperties: false },
		),
		executionMode: "sequential",
		execute: async (_toolCallId, params) => {
			// 校验失败照原样抛给 pi，不动任何状态
			const next = validateTasks(params, {
				toolName,
				maxTasks: config.plan.maxTasks,
				maxContentChars: config.plan.maxSubjectChars,
				requireSingleInProgress: config.plan.requireSingleInProgress,
			});
			commit(next);
			return {
				content: [{ type: "text", text: formatTasks(tasks) }],
				details: undefined,
			};
		},
	});

	if (config.commands.todos.enabled) {
		pi.registerCommand(COMMAND_NAME, {
			description: "Show or edit the todo list",
			handler: async (args, ctx) => {
				// 子命令后面剩下的整段原样留着：import 的路径可以有空格
				const parts = /^(\S+)(?:\s+([\s\S]*))?$/.exec(args.trim());
				const sub = parts?.[1];
				const rest = (parts?.[2] ?? "").trim();

				if (sub === undefined) {
					notify(ctx, renderList(tasks, widgetConfig), "info");
					return;
				}
				if (sub === "clear") {
					if (rest !== "") {
						notify(ctx, USAGE, "warning");
						return;
					}
					commit([]);
					notify(ctx, "Cleared", "info");
					return;
				}
				if (sub === "export") {
					if (!config.commands.export.enabled) {
						notify(
							ctx,
							"export is disabled (commands.export.enabled = false)",
							"warning",
						);
						return;
					}
					if (rest !== "") {
						notify(ctx, USAGE, "warning");
						return;
					}
					try {
						const path = writeExportFile(
							ctx.cwd,
							config.commands.export.dir,
							config.commands.export.fileNamePattern,
							toMarkdown(tasks),
						);
						notify(
							ctx,
							`Exported ${tasks.length} ${tasks.length === 1 ? "task" : "tasks"} to ${path}`,
							"info",
						);
					} catch (error) {
						notify(ctx, (error as Error).message, "error");
					}
					return;
				}
				if (sub === "import") {
					if (!config.commands.import.enabled) {
						notify(
							ctx,
							"import is disabled (commands.import.enabled = false)",
							"warning",
						);
						return;
					}
					const target = stripQuotes(rest);
					if (target === "") {
						notify(ctx, USAGE, "warning");
						return;
					}
					// 只在表是空的时候允许导：导进来的表会顶掉模型手上那张表
					if (tasks.length > 0) {
						notify(
							ctx,
							"Table is not empty. Run /todos clear first.",
							"warning",
						);
						return;
					}
					const path = isAbsolute(target) ? target : resolve(ctx.cwd, target);
					let text: string;
					try {
						text = readFileSync(path, "utf-8");
					} catch (error) {
						notify(
							ctx,
							`Cannot read ${path}: ${(error as Error).message}`,
							"error",
						);
						return;
					}
					try {
						const next = validateTasks(
							{ tasks: parseChecklist(text) },
							{
								toolName,
								maxTasks: config.plan.maxTasks,
								maxContentChars: config.plan.maxSubjectChars,
							},
						);
						commit(next);
						notify(
							ctx,
							`Imported ${next.length} ${next.length === 1 ? "task" : "tasks"} from ${path}`,
							"info",
						);
					} catch (error) {
						notify(ctx, (error as Error).message, "error");
					}
					return;
				}
				notify(ctx, USAGE, "warning");
			},
		});
	}

	if (config.ui.shortcut.toggle !== "off") {
		// 键位字符串原样交给 pi：它认不出的键匹配不上任何输入，不用我们校验
		pi.registerShortcut(config.ui.shortcut.toggle as KeyId, {
			description: "Toggle the todo widget",
			handler: (ctx) => {
				collapsed = !collapsed;
				draw(ctx);
			},
		});
	}

	if (config.lifecycle.onFinish === "clear") {
		pi.on("input", () => {
			if (
				tasks.length === 0 ||
				tasks.some((task) => task.status !== "completed")
			)
				return;
			commit([]);
		});
	}

	pi.on("session_start", (_event, ctx) => restore(ctx));
	pi.on("session_compact", (_event, ctx) => restore(ctx));
	pi.on("session_tree", (_event, ctx) => restore(ctx));
}
