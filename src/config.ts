import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

/** 配置键的类型；键表与取值说明见 README 的配置节。 */
export type Config = {
	tools: { todo: { name: string } };
	plan: {
		maxTasks: number;
		maxSubjectChars: number;
		requireSingleInProgress: boolean;
	};
	ui: {
		widget: {
			enabled: boolean;
			maxLines: number;
			placement: "aboveEditor" | "belowEditor";
			showCompleted: boolean;
			header: string;
			glyphs: { pending: string; inProgress: string; completed: string };
			completedStyle: "strikethrough" | "dim" | "plain";
		};
		shortcut: { toggle: string };
	};
	lifecycle: { onFinish: "model" | "keep" | "clear" };
	commands: {
		todos: { enabled: boolean };
		export: { enabled: boolean; dir: string; fileNamePattern: string };
		import: { enabled: boolean };
	};
	guidance: {
		description: string;
		promptSnippet: string;
		promptGuidelines: string[];
	};
};

export type LoadOptions = {
	/** 直接指定配置文件；不给则按 configPath > $PI_CODING_AGENT_DIR > ~/.pi/agent 解析。 */
	configPath?: string;
	/** 只读其中的 PI_CODING_AGENT_DIR，默认 process.env。 */
	env?: NodeJS.ProcessEnv;
};

/**
 * 默认值。键表改一份就改这里：README 的配置示例是它的文档（docs.test.ts 对账）。
 * guidance 里的 `tool-name:` 是占位符，index.ts 注册时替成 tools.todo.name。
 */
export const DEFAULTS: Config = {
	tools: { todo: { name: "todo" } },
	plan: { maxTasks: 20, maxSubjectChars: 120, requireSingleInProgress: false },
	ui: {
		widget: {
			enabled: true,
			maxLines: 9,
			placement: "aboveEditor",
			showCompleted: true,
			header: "Todo {done}/{total} · {doing} doing",
			glyphs: { pending: "[ ]", inProgress: "[-]", completed: "[x]" },
			completedStyle: "strikethrough",
		},
		shortcut: { toggle: "alt+t" },
	},
	// 默认 clear：整表完成后等用户下一条消息再清（时机见 docs/SPEC.md 的 AC8）
	lifecycle: { onFinish: "clear" },
	commands: {
		todos: { enabled: true },
		export: { enabled: true, dir: "", fileNamePattern: "todo-{timestamp}.md" },
		import: { enabled: true },
	},
	guidance: {
		description: "Keep a todo list for multi-step work.",
		promptSnippet: "",
		// 拆成三条：index.ts 按 onFinish 只过滤掉最后那条（keep / clear 档不告诉模型「发空表能清」）
		promptGuidelines: [
			"tool-name: Keep content short, one line, imperative.",
			"tool-name: Use for work with 3+ steps.",
			"tool-name: When the whole plan is done, send `tasks: []` to clear.",
		],
	},
};

const PLACEMENTS = ["aboveEditor", "belowEditor"] as const;
const COMPLETED_STYLES = ["strikethrough", "dim", "plain"] as const;
const ON_FINISH = ["model", "keep", "clear"] as const;
const TOOL_NAME = /^[A-Za-z][A-Za-z0-9_]*$/;

/** 配置文件绝对路径：入参 > $PI_CODING_AGENT_DIR > ~/.pi/agent。 */
export function resolveConfigPath(options: LoadOptions = {}): string {
	if (options.configPath !== undefined) return resolve(options.configPath);
	const env = options.env ?? process.env;
	const agentDir = env.PI_CODING_AGENT_DIR
		? resolve(env.PI_CODING_AGENT_DIR)
		: join(homedir(), ".pi", "agent");
	return join(agentDir, "pi-todo", "config.json");
}

/**
 * 读配置。文件不存在取全默认值；JSON 坏、未知键、类型或枚举错抛 Error
 * （消息含绝对路径，逐条 <字段路径>: <原因>，一次列完）；数值越界 clamp。
 */
export function loadConfig(options: LoadOptions = {}): Config {
	const path = resolveConfigPath(options);
	const source = readConfigFile(path);
	if (source === undefined) return structuredClone(DEFAULTS);

	let parsed: unknown;
	try {
		parsed = JSON.parse(source);
	} catch (error) {
		throw new Error(
			`pi-todo config ${path}: invalid JSON: ${error instanceof Error ? error.message : String(error)}`,
		);
	}

	const errors: string[] = [];
	const config = buildConfig(parsed, errors);
	if (errors.length > 0)
		throw new Error(`pi-todo config ${path}: ${errors.join("\n")}`);
	return config;
}

type Raw = Record<string, unknown>;

function readConfigFile(path: string): string | undefined {
	try {
		return readFileSync(path, "utf-8");
	} catch (error) {
		if (isRecord(error) && error.code === "ENOENT") return undefined;
		throw error;
	}
}

function buildConfig(input: unknown, errors: string[]): Config {
	if (!isRecord(input)) {
		errors.push(`expected object, got ${describe(input)}`);
		return structuredClone(DEFAULTS);
	}
	checkKeys(
		input,
		"",
		["tools", "plan", "ui", "lifecycle", "commands", "guidance"],
		errors,
	);

	const tools = readGroup(input.tools, "tools", errors);
	checkKeys(tools, "tools", ["todo"], errors);
	const todo = readGroup(tools.todo, "tools.todo", errors);
	checkKeys(todo, "tools.todo", ["name"], errors);

	const plan = readGroup(input.plan, "plan", errors);
	checkKeys(
		plan,
		"plan",
		["maxTasks", "maxSubjectChars", "requireSingleInProgress"],
		errors,
	);

	const ui = readGroup(input.ui, "ui", errors);
	checkKeys(ui, "ui", ["widget", "shortcut"], errors);
	const widget = readGroup(ui.widget, "ui.widget", errors);
	checkKeys(
		widget,
		"ui.widget",
		[
			"enabled",
			"maxLines",
			"placement",
			"showCompleted",
			"header",
			"glyphs",
			"completedStyle",
		],
		errors,
	);
	const glyphs = readGroup(widget.glyphs, "ui.widget.glyphs", errors);
	checkKeys(
		glyphs,
		"ui.widget.glyphs",
		["pending", "inProgress", "completed"],
		errors,
	);
	const shortcut = readGroup(ui.shortcut, "ui.shortcut", errors);
	checkKeys(shortcut, "ui.shortcut", ["toggle"], errors);

	const lifecycle = readGroup(input.lifecycle, "lifecycle", errors);
	checkKeys(lifecycle, "lifecycle", ["onFinish"], errors);

	const commands = readGroup(input.commands, "commands", errors);
	checkKeys(commands, "commands", ["todos", "export", "import"], errors);
	const todosCommand = readGroup(commands.todos, "commands.todos", errors);
	checkKeys(todosCommand, "commands.todos", ["enabled"], errors);
	const exportCommand = readGroup(commands.export, "commands.export", errors);
	checkKeys(
		exportCommand,
		"commands.export",
		["enabled", "dir", "fileNamePattern"],
		errors,
	);
	const importCommand = readGroup(commands.import, "commands.import", errors);
	checkKeys(importCommand, "commands.import", ["enabled"], errors);

	const guidance = readGroup(input.guidance, "guidance", errors);
	checkKeys(
		guidance,
		"guidance",
		["description", "promptSnippet", "promptGuidelines"],
		errors,
	);

	return {
		tools: {
			todo: {
				name: readName(
					todo,
					"name",
					"tools.todo.name",
					errors,
					DEFAULTS.tools.todo.name,
				),
			},
		},
		plan: {
			maxTasks: readNumber(
				plan,
				"maxTasks",
				"plan.maxTasks",
				errors,
				DEFAULTS.plan.maxTasks,
				1,
				200,
			),
			maxSubjectChars: readNumber(
				plan,
				"maxSubjectChars",
				"plan.maxSubjectChars",
				errors,
				DEFAULTS.plan.maxSubjectChars,
				20,
				400,
			),
			requireSingleInProgress: readBoolean(
				plan,
				"requireSingleInProgress",
				"plan.requireSingleInProgress",
				errors,
				DEFAULTS.plan.requireSingleInProgress,
			),
		},
		ui: {
			widget: {
				enabled: readBoolean(
					widget,
					"enabled",
					"ui.widget.enabled",
					errors,
					DEFAULTS.ui.widget.enabled,
				),
				maxLines: readNumber(
					widget,
					"maxLines",
					"ui.widget.maxLines",
					errors,
					DEFAULTS.ui.widget.maxLines,
					3,
					10,
				),
				placement: readEnum(
					widget,
					"placement",
					"ui.widget.placement",
					errors,
					DEFAULTS.ui.widget.placement,
					PLACEMENTS,
				),
				showCompleted: readBoolean(
					widget,
					"showCompleted",
					"ui.widget.showCompleted",
					errors,
					DEFAULTS.ui.widget.showCompleted,
				),
				header: readString(
					widget,
					"header",
					"ui.widget.header",
					errors,
					DEFAULTS.ui.widget.header,
				),
				glyphs: {
					pending: readString(
						glyphs,
						"pending",
						"ui.widget.glyphs.pending",
						errors,
						DEFAULTS.ui.widget.glyphs.pending,
					),
					inProgress: readString(
						glyphs,
						"inProgress",
						"ui.widget.glyphs.inProgress",
						errors,
						DEFAULTS.ui.widget.glyphs.inProgress,
					),
					completed: readString(
						glyphs,
						"completed",
						"ui.widget.glyphs.completed",
						errors,
						DEFAULTS.ui.widget.glyphs.completed,
					),
				},
				completedStyle: readEnum(
					widget,
					"completedStyle",
					"ui.widget.completedStyle",
					errors,
					DEFAULTS.ui.widget.completedStyle,
					COMPLETED_STYLES,
				),
			},
			shortcut: {
				toggle: readString(
					shortcut,
					"toggle",
					"ui.shortcut.toggle",
					errors,
					DEFAULTS.ui.shortcut.toggle,
				),
			},
		},
		lifecycle: {
			onFinish: readEnum(
				lifecycle,
				"onFinish",
				"lifecycle.onFinish",
				errors,
				DEFAULTS.lifecycle.onFinish,
				ON_FINISH,
			),
		},
		commands: {
			todos: {
				enabled: readBoolean(
					todosCommand,
					"enabled",
					"commands.todos.enabled",
					errors,
					DEFAULTS.commands.todos.enabled,
				),
			},
			export: {
				enabled: readBoolean(
					exportCommand,
					"enabled",
					"commands.export.enabled",
					errors,
					DEFAULTS.commands.export.enabled,
				),
				dir: readString(
					exportCommand,
					"dir",
					"commands.export.dir",
					errors,
					DEFAULTS.commands.export.dir,
				),
				fileNamePattern: readString(
					exportCommand,
					"fileNamePattern",
					"commands.export.fileNamePattern",
					errors,
					DEFAULTS.commands.export.fileNamePattern,
				),
			},
			import: {
				enabled: readBoolean(
					importCommand,
					"enabled",
					"commands.import.enabled",
					errors,
					DEFAULTS.commands.import.enabled,
				),
			},
		},
		guidance: {
			description: readString(
				guidance,
				"description",
				"guidance.description",
				errors,
				DEFAULTS.guidance.description,
			),
			promptSnippet: readString(
				guidance,
				"promptSnippet",
				"guidance.promptSnippet",
				errors,
				DEFAULTS.guidance.promptSnippet,
			),
			promptGuidelines: readStringArray(
				guidance,
				"promptGuidelines",
				"guidance.promptGuidelines",
				errors,
				DEFAULTS.guidance.promptGuidelines,
			),
		},
	};
}

/** 取一个对象型字段；缺席当空对象（其下子键各自回落默认值），类型不对报错。 */
function readGroup(value: unknown, path: string, errors: string[]): Raw {
	if (value === undefined) return {};
	if (isRecord(value)) return value;
	errors.push(`${path}: expected object, got ${describe(value)}`);
	return {};
}

function checkKeys(
	raw: Raw,
	path: string,
	known: readonly string[],
	errors: string[],
): void {
	for (const key of Object.keys(raw)) {
		if (!known.includes(key))
			errors.push(`${path === "" ? "" : `${path}.`}${key}: unknown key`);
	}
}

function readNumber(
	raw: Raw,
	key: string,
	path: string,
	errors: string[],
	fallback: number,
	min: number,
	max: number,
): number {
	const value = raw[key];
	if (value === undefined) return fallback;
	if (typeof value !== "number" || !Number.isInteger(value)) {
		errors.push(
			`${path}: ${typeof value === "number" ? `expected integer, got ${value}` : `expected number, got ${describe(value)}`}`,
		);
		return fallback;
	}
	return Math.min(max, Math.max(min, value));
}

function readBoolean(
	raw: Raw,
	key: string,
	path: string,
	errors: string[],
	fallback: boolean,
): boolean {
	const value = raw[key];
	if (value === undefined) return fallback;
	if (typeof value !== "boolean") {
		errors.push(`${path}: expected boolean, got ${describe(value)}`);
		return fallback;
	}
	return value;
}

function readString(
	raw: Raw,
	key: string,
	path: string,
	errors: string[],
	fallback: string,
): string {
	const value = raw[key];
	if (value === undefined) return fallback;
	if (typeof value !== "string") {
		errors.push(`${path}: expected string, got ${describe(value)}`);
		return fallback;
	}
	return value;
}

function readName(
	raw: Raw,
	key: string,
	path: string,
	errors: string[],
	fallback: string,
): string {
	const value = raw[key];
	if (value === undefined) return fallback;
	if (typeof value !== "string" || !TOOL_NAME.test(value)) {
		errors.push(
			`${path}: expected a name starting with a letter and containing only letters, digits or underscores, got ${describe(value)}`,
		);
		return fallback;
	}
	return value;
}

function readEnum<T extends string>(
	raw: Raw,
	key: string,
	path: string,
	errors: string[],
	fallback: T,
	values: readonly T[],
): T {
	const value = raw[key];
	if (value === undefined) return fallback;
	if (typeof value !== "string" || !values.includes(value as T)) {
		errors.push(
			`${path}: expected one of ${values.join(" | ")}, got ${describe(value)}`,
		);
		return fallback;
	}
	return value as T;
}

function readStringArray(
	raw: Raw,
	key: string,
	path: string,
	errors: string[],
	fallback: string[],
): string[] {
	const value = raw[key];
	if (value === undefined) return [...fallback];
	if (!Array.isArray(value)) {
		errors.push(`${path}: expected array of strings, got ${describe(value)}`);
		return [...fallback];
	}
	const items: string[] = [];
	for (const [index, item] of value.entries()) {
		if (typeof item === "string") items.push(item);
		else
			errors.push(`${path}[${index}]: expected string, got ${describe(item)}`);
	}
	return items;
}

function isRecord(value: unknown): value is Raw {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** 报错时替进消息里的值：标量照原样、字符串带引号，容器只说形状 —— 不回显正文。 */
function describe(value: unknown): string {
	if (typeof value === "string") return echo(value);
	if (value === null || typeof value !== "object") return String(value);
	if (Array.isArray(value)) return `array of ${value.length}`;
	const keys = Object.keys(value);
	return `object with keys ${keys.length === 0 ? "(none)" : keys.join(", ")}`;
}

/** 回显字符串的上限（按 code point 计）：超了截断，别把大段正文灌进错误消息。 */
const ECHO_LIMIT = 32;

function echo(value: string): string {
	const chars = Array.from(value);
	return chars.length <= ECHO_LIMIT
		? JSON.stringify(value)
		: `${JSON.stringify(chars.slice(0, ECHO_LIMIT).join(""))}…`;
}
