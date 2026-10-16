/** 三态，没有 deleted：删就是不出现在表里。 */
export type Status = "pending" | "in_progress" | "completed";

export type Task = {
	content: string;
	status: Status;
};

export type ValidateOptions = {
	/** 工具名，出现在每条错误消息的开头。 */
	toolName: string;
	maxTasks: number;
	maxContentChars: number;
};

const STATUSES = ["pending", "in_progress", "completed"] as const;

/** 消息里回显字符串的上限（按 code point 计）：超了截断，别把大段正文灌进错误消息。 */
const ECHO_LIMIT = 32;

/**
 * 违规字符：C0/C1 控制符、行分隔符，以及 RLO / ZWSP / BOM 这类不可见格式字符（\p{Cf}，连 ZWJ 组字 emoji 一起）
 * —— 这里是纯文本，不做任何白名单。
 */
const FORBIDDEN_CHARS = /[\p{Cc}\p{Zl}\p{Zp}\p{Cf}]/u;
const FORBIDDEN_RUN = /[\p{Cc}\p{Zl}\p{Zp}\p{Cf}]+/gu;

/** 一整条转义序列：CSI（`ESC [ 31m`）、OSC（`ESC ] 8;;url BEL`）与单字符的 Fe 转义 —— 只删 ESC 会留下 `[31m` 这种残渣。 */
const ESCAPE_SEQUENCE = /\u001b(?:\[[0-?]*[ -/]*[@-~]|\][^\u0007\u001b]*(?:\u0007|\u001b\\|$)|[@-Z\\-_])/g;

/** 快照的 customType：状态只写这一条账。 */
const STATE_CUSTOM_TYPE = "pi-todo-state";

/** 三态各自的字形。 */
const GLYPHS: Record<Status, string> = {
	pending: "[ ]",
	in_progress: "[-]",
	completed: "[x]",
};

/**
 * 校验一次整表提交。全有或全无：任一项不合规就抛 Error，消息按条列出全部违规
 * （每条前缀 `<toolName>: `，逐行），返回的是 trim 过的新数组，不改入参。
 */
export function validateTasks(input: unknown, options: ValidateOptions): Task[] {
	const prefix = `${options.toolName}: `;
	if (!isRecord(input)) throw new Error(`${prefix}expected object, got ${describe(input)}`);

	const reasons: string[] = [];
	for (const key of Object.keys(input)) {
		if (key !== "tasks") reasons.push(`unknown key ${JSON.stringify(key)}`);
	}

	const raw = input.tasks;
	const tasks: Task[] = [];
	if (Array.isArray(raw)) {
		if (raw.length > options.maxTasks) reasons.push(`tasks has ${raw.length} items, max is ${options.maxTasks}`);
		for (const [index, item] of raw.entries()) {
			const task = checkTask(item, index + 1, options, reasons);
			if (task !== undefined) tasks.push(task);
		}
	} else {
		reasons.push(`tasks: expected array, got ${describe(raw)}`);
	}

	if (reasons.length > 0) throw new Error(reasons.map((reason) => prefix + reason).join("\n"));
	return tasks;
}

/** 校验一项；不合规的把原因写进 reasons 并返回 undefined。 */
function checkTask(value: unknown, position: number, options: ValidateOptions, reasons: string[]): Task | undefined {
	const at = `task ${position}: `;
	if (!isRecord(value)) {
		reasons.push(`${at}expected object, got ${describe(value)}`);
		return undefined;
	}
	const content = readContent(value.content, at, options, reasons);
	const status = readStatus(value.status, at, reasons);
	for (const key of Object.keys(value)) {
		if (key !== "content" && key !== "status") reasons.push(`${at}unknown key ${JSON.stringify(key)}`);
	}
	if (content === undefined || status === undefined) return undefined;
	return { content, status };
}

function readContent(value: unknown, at: string, options: ValidateOptions, reasons: string[]): string | undefined {
	if (typeof value !== "string") {
		reasons.push(`${at}expected string, got ${describe(value)}`);
		return undefined;
	}
	const content = value.trim();
	if (content === "") {
		reasons.push(`${at}content is empty`);
		return undefined;
	}
	let ok = true;
	const forbidden = FORBIDDEN_CHARS.exec(content);
	if (forbidden !== null) {
		reasons.push(`${at}content has ${offense(forbidden[0])}`);
		ok = false;
	}
	const length = countChars(content);
	if (length > options.maxContentChars) {
		reasons.push(`${at}content is ${length} chars, max is ${options.maxContentChars}`);
		ok = false;
	}
	return ok ? content : undefined;
}

const CHARACTER_NAMES: Record<number, string> = {
	0x09: "a tab",
	0x0a: "a newline",
	0x0d: "a carriage return",
	0x1b: "an escape character",
	0x200b: "a zero-width space",
	0x2028: "a line separator",
	0x2029: "a paragraph separator",
	0x202e: "a right-to-left override",
	0xfeff: "a byte order mark",
};

/** 违规字符 → 报错里的原因：`a newline (U+000A); keep it one line` / `a right-to-left override (U+202E); keep it plain text`。 */
function offense(char: string): string {
	const code = char.codePointAt(0) ?? 0;
	const wraps = /[\p{Cc}\p{Zl}\p{Zp}]/u.test(char);
	const what = CHARACTER_NAMES[code] ?? (wraps ? "a control character" : "an invisible character");
	const fix = wraps ? "keep it one line" : "keep it plain text";
	return `${what} (U+${code.toString(16).toUpperCase().padStart(4, "0")}); ${fix}`;
}

function readStatus(value: unknown, at: string, reasons: string[]): Status | undefined {
	if (typeof value !== "string" || !(STATUSES as readonly string[]).includes(value)) {
		reasons.push(`${at}expected one of ${STATUSES.join(" | ")}, got ${describe(value)}`);
		return undefined;
	}
	return value as Status;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** 按 Unicode code point 计（`Array.from`）：emoji 算 1 个，与「120 字符」的直觉一致。 */
function countChars(value: string): number {
	return Array.from(value).length;
}

/** 报错时替进消息里的值：标量照原样、字符串带引号（超长截断），容器只说形状 —— 不回显正文。 */
function describe(value: unknown): string {
	if (typeof value === "string") return echo(value);
	if (value === null || typeof value !== "object") return String(value);
	if (Array.isArray(value)) return `array of ${value.length}`;
	const keys = Object.keys(value);
	return `object with keys ${keys.length === 0 ? "(none)" : keys.join(", ")}`;
}

function echo(value: string): string {
	const chars = Array.from(value);
	return chars.length <= ECHO_LIMIT ? JSON.stringify(value) : `${JSON.stringify(chars.slice(0, ECHO_LIMIT).join(""))}…`;
}

/**
 * 从会话条目里回放状态：从后往前找**最后一条有效快照**，坏条目跳过继续往前扫，
 * 一条都没有就是空表。只认 `type: "custom"` + `customType: "pi-todo-state"` 的
 * `data.tasks`，不读 toolResult 的 details。
 */
export function replayTasks(entries: readonly unknown[]): Task[] {
	for (let index = entries.length - 1; index >= 0; index -= 1) {
		const tasks = readSnapshot(entries[index]);
		if (tasks !== undefined) return tasks;
	}
	return [];
}

/**
 * 读一条快照；不是我们的条目、或形状坏了 → undefined（当作没有）。快照里的控制字符
 * 压成空格：老账本里留了换行不该让整张表消失。
 */
function readSnapshot(entry: unknown): Task[] | undefined {
	if (!isRecord(entry) || entry.type !== "custom" || entry.customType !== STATE_CUSTOM_TYPE) return undefined;

	const data = entry.data;
	if (!isRecord(data) || !Array.isArray(data.tasks)) return undefined;

	const tasks: Task[] = [];
	for (const item of data.tasks) {
		if (!isRecord(item)) return undefined;
		if (typeof item.content !== "string") return undefined;
		if (typeof item.status !== "string" || !(STATUSES as readonly string[]).includes(item.status)) return undefined;
		const content = item.content.replace(ESCAPE_SEQUENCE, "").replace(FORBIDDEN_RUN, " ").trim();
		if (content === "") return undefined;
		tasks.push({ content, status: item.status as Status });
	}
	return tasks;
}

/** 工具返回给模型的文本：一行进度 + 每项一行（`[ ]` / `[-]` / `[x]`）。空表就只有那行进度。 */
export function formatTasks(tasks: readonly Task[]): string {
	return [progressLine(tasks), ...tasks.map((task) => `${GLYPHS[task.status]} ${task.content}`)].join("\n");
}

/** `Todo {done}/{total}`；有 in_progress 才补 `· {doing} doing`（与 widget 表头同一规则）。 */
function progressLine(tasks: readonly Task[]): string {
	const done = tasks.filter((task) => task.status === "completed").length;
	const doing = tasks.filter((task) => task.status === "in_progress").length;
	const counts = `Todo ${done}/${tasks.length}`;
	return doing === 0 ? counts : `${counts} · ${doing} doing`;
}

