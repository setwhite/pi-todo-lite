/**
 * pi-todo-lite — Pi 扩展入口。唯一 import pi 的文件，只做接线：
 * 读配置 → 注册 todo 工具 → 三个会话事件回放快照 → setWidget 组件工厂。
 * 模型侧文案（description / guidelines）的定稿文本存在 config.ts 的 DEFAULTS 里，`tool-name` 在注册时替成配置里的真实工具名。
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { Component, TUI } from "@earendil-works/pi-tui";
import { Type } from "typebox";
import { loadConfig } from "./config.ts";
import { STATE_CUSTOM_TYPE, formatTasks, replayTasks, validateTasks, type Task } from "./plan.ts";
import { exportFileName, parseChecklist, renderList, renderWidget, toMarkdown, type WidgetConfig } from "./view.ts";

/** widget key：`ctx.ui.setWidget("todo", …)`。 */
const WIDGET_KEY = "todo";

/** 命令名：`/todos`。与 rpiv-todo 装的同名命令撞车问题见 docs/TODO.md 的 T8 偏差。 */
const COMMAND_NAME = "todos";

/** 同名文件最多让位多少次（`name` → `name-2` → …）。 */
const EXPORT_NAME_ATTEMPTS = 100;

/** 用法提示：子命令不认识、或者 `import` 少了文件名时给同一句。 */
const USAGE = `Usage: /${COMMAND_NAME} [clear | export | import <file>]`;

/** 导出目录：空配置 = 当前项目根，相对路径按项目根解析。 */
function exportDir(cwd: string, dir: string): string {
	return dir === "" ? cwd : resolve(cwd, dir);
}

/** 名字模板只准给文件名：目录归 `commands.export.dir`，带分隔符或为空就报错。 */
function assertPlainName(name: string, pattern: string): void {
	if (name === "" || name === "." || name === ".." || /[\\/]/.test(name)) {
		throw new Error(`commands.export.fileNamePattern must be a file name, got "${pattern}"`);
	}
}

/** 剥掉一层配对引号：路径里有空格时用户会写 `"a b.md"`。 */
function stripQuotes(value: string): string {
	const quote = value[0];
	if (value.length >= 2 && (quote === '"' || quote === "'") && value.endsWith(quote)) return value.slice(1, -1).trim();
	return value;
}

/** 落盘：从 `pattern` 算出的名字被占了就依次试 `-2`、`-3`…，返回真正写入的绝对路径。 */
function writeExportFile(cwd: string, dir: string, pattern: string, text: string): string {
	const target = exportDir(cwd, dir);
	const name = exportFileName(pattern, new Date());
	// 先判名字：模板写坏时别为一个注定失败的名字建目录
	assertPlainName(name, pattern);
	mkdirSync(target, { recursive: true });

	const dot = name.lastIndexOf(".");
	const stem = dot === -1 ? name : name.slice(0, dot);
	const suffix = dot === -1 ? "" : name.slice(dot);

	for (let attempt = 1; attempt <= EXPORT_NAME_ATTEMPTS; attempt += 1) {
		const path = join(target, attempt === 1 ? name : `${stem}-${attempt}${suffix}`);
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

/** 模型侧 guidelines 里的工具名占位符：`tool-name: …` 注册时变成 `todo: …`。 */
const TOOL_NAME_PLACEHOLDER = "tool-name";

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
	/** 当前任务表：只由工具调用与回放改变，widget 每次 render 都读它。 */
	let tasks: Task[] = [];
	/** 组件工厂给的 TUI 句柄，用来在状态变化后重画；没有 UI 时一直是 undefined。 */
	let tui: TUI | undefined;

	/** 组件只读 live 状态、不缓存，所以 invalidate 空转。 */
	const widget = (): Component & { dispose?(): void } => ({
		render: (width: number) => renderWidget(tasks, widgetConfig, width) ?? [],
		invalidate: () => {},
	});

	/** 重设 widget：widget 关掉、没有 UI、宿主不认 setWidget 时都静默跳过。 */
	const draw = (ctx: ExtensionContext): void => {
		if (!config.ui.widget.enabled || !ctx.hasUI || typeof ctx.ui?.setWidget !== "function") return;
		ctx.ui.setWidget(
			WIDGET_KEY,
			(handle) => {
				tui = handle;
				return widget();
			},
			{ placement: widgetConfig.placement },
		);
	};

	/** 状态落账：写快照 → 更新内存 → 重画（工具与命令共用）。 */
	const commit = (next: Task[]): void => {
		pi.appendEntry(STATE_CUSTOM_TYPE, { tasks: next });
		tasks = next;
		tui?.requestRender();
	};

	/** 命令输出一律走 `ctx.ui.notify`；JSON / print 下没有 ui 就静默跳过（状态照旧落账）。 */
	const notify = (ctx: ExtensionContext, message: string, type: "info" | "warning" | "error"): void => {
		if (typeof ctx.ui?.notify !== "function") return;
		ctx.ui.notify(message, type);
	};

	/** 从当前分支最后一条快照恢复，再重画。 */
	const restore = (ctx: ExtensionContext): void => {
		tasks = replayTasks(ctx.sessionManager.getBranch());
		draw(ctx);
	};

	pi.registerTool({
		name: toolName,
		label: "Todo",
		description: config.guidance.description,
		promptSnippet: config.guidance.promptSnippet || undefined,
		// 一处 guideline 里可能写多次占位符：全部替换，没写的原样留着
		promptGuidelines: config.guidance.promptGuidelines.map((guideline) => guideline.replaceAll(TOOL_NAME_PLACEHOLDER, toolName)),
		// 三个字段全必填、无字段文案；additionalProperties: false 与 plan.ts 的未知键拒绝同一件事
		parameters: Type.Object(
			{
				tasks: Type.Array(
					Type.Object(
						{
							content: Type.String(),
							status: Type.Union([Type.Literal("pending"), Type.Literal("in_progress"), Type.Literal("completed")]),
						},
						{ additionalProperties: false },
					),
				),
			},
			{ additionalProperties: false },
		),
		executionMode: "sequential",
		execute: async (_toolCallId, params) => {
			// 校验失败照原样抛给 pi，这里不动任何状态
			const next = validateTasks(params, { toolName, maxTasks: config.plan.maxTasks, maxContentChars: config.plan.maxSubjectChars });
			commit(next);
			// details 留空：状态只写 custom entry，回放不读 toolResult 的 details
			return { content: [{ type: "text", text: formatTasks(tasks) }], details: undefined };
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
						notify(ctx, "export is disabled (commands.export.enabled = false)", "warning");
						return;
					}
					if (rest !== "") {
						notify(ctx, USAGE, "warning");
						return;
					}
					try {
						const path = writeExportFile(ctx.cwd, config.commands.export.dir, config.commands.export.fileNamePattern, toMarkdown(tasks));
						notify(ctx, `Exported ${tasks.length} ${tasks.length === 1 ? "task" : "tasks"} to ${path}`, "info");
					} catch (error) {
						// 命令面不许把异常抛回宿主（用户只会看到 extension_error，收不到提示）
						notify(ctx, (error as Error).message, "error");
					}
					return;
				}
				if (sub === "import") {
					if (!config.commands.import.enabled) {
						notify(ctx, "import is disabled (commands.import.enabled = false)", "warning");
						return;
					}
					const target = stripQuotes(rest);
					if (target === "") {
						notify(ctx, USAGE, "warning");
						return;
					}
					// 只在表是空的时候允许导：导进来的表会顶掉模型手上那张表
					if (tasks.length > 0) {
						notify(ctx, "Table is not empty. Run /todos clear first.", "warning");
						return;
					}
					const path = isAbsolute(target) ? target : resolve(ctx.cwd, target);
					let text: string;
					try {
						text = readFileSync(path, "utf-8");
					} catch (error) {
						notify(ctx, `Cannot read ${path}: ${(error as Error).message}`, "error");
						return;
					}
					try {
						const next = validateTasks({ tasks: parseChecklist(text) }, { toolName, maxTasks: config.plan.maxTasks, maxContentChars: config.plan.maxSubjectChars });
						commit(next);
						notify(ctx, `Imported ${next.length} ${next.length === 1 ? "task" : "tasks"} from ${path}`, "info");
					} catch (error) {
						notify(ctx, (error as Error).message, "error");
					}
					return;
				}
				notify(ctx, USAGE, "warning");
			},
		});
	}

	pi.on("session_start", (_event, ctx) => restore(ctx));
	pi.on("session_compact", (_event, ctx) => restore(ctx));
	pi.on("session_tree", (_event, ctx) => restore(ctx));
}
