/**
 * pi-todo-lite — Pi 扩展入口。唯一 import pi 的文件，只做接线：
 * 读配置 → 注册 todo 工具 → 三个会话事件回放快照 → setWidget 组件工厂。
 * 模型侧文案（description / guidelines）的定稿文本存在 config.ts 的 DEFAULTS 里，`tool-name` 在注册时替成配置里的真实工具名。
 */

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { Component, TUI } from "@earendil-works/pi-tui";
import { Type } from "typebox";
import { loadConfig } from "./config.ts";
import { STATE_CUSTOM_TYPE, formatTasks, replayTasks, validateTasks, type Task } from "./plan.ts";
import { renderWidget, type WidgetConfig } from "./view.ts";

/** widget key：`ctx.ui.setWidget("todo", …)`。 */
const WIDGET_KEY = "todo";

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
			pi.appendEntry(STATE_CUSTOM_TYPE, { tasks: next });
			tasks = next;
			tui?.requestRender();
			// details 留空：状态只写 custom entry，回放不读 toolResult 的 details
			return { content: [{ type: "text", text: formatTasks(tasks) }], details: undefined };
		},
	});

	pi.on("session_start", (_event, ctx) => restore(ctx));
	pi.on("session_compact", (_event, ctx) => restore(ctx));
	pi.on("session_tree", (_event, ctx) => restore(ctx));
}
