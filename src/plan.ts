export type Status = "pending" | "in_progress" | "completed";

export type Task = {
	content: string;
	status: Status;
};

export type ValidateOptions = {
	toolName: string;
	maxTasks: number;
	maxContentChars: number;
	requireSingleInProgress?: boolean;
};

const STATUSES = ["pending", "in_progress", "completed"] as const;

const ECHO_LIMIT = 32;

/** 不做白名单：`\p{Cf}` 连 ZWJ 组字 emoji 一并拒。 */
const FORBIDDEN_CHARS = /[\p{Cc}\p{Zl}\p{Zp}\p{Cf}]/u;
const FORBIDDEN_RUN = /[\p{Cc}\p{Zl}\p{Zp}\p{Cf}]+/gu;

/** 整条转义序列（CSI / OSC / Fe）：只删 ESC 会留下 `[31m` 这种残渣。 */
const ESCAPE_SEQUENCE =
	// biome-ignore lint/suspicious/noControlCharactersInRegex: 要匹配的就是 ESC / BEL 本身 —— 账本侧靠这条把转义序列整条丢掉
	/\u001b(?:\[[0-?]*[ -/]*[@-~]|\][^\u0007\u001b]*(?:\u0007|\u001b\\|$)|[@-Z\\-_])/g;

export const STATE_CUSTOM_TYPE = "pi-todo-state";

const GLYPHS: Record<Status, string> = {
	pending: "[ ]",
	in_progress: "[-]",
	completed: "[x]",
};

/** 全有或全无：一次列完全部原因再抛；返回 trim 过的新数组，不改入参。 */
export function validateTasks(
	input: unknown,
	options: ValidateOptions,
): Task[] {
	const prefix = `${options.toolName}: `;
	if (!isRecord(input))
		throw new Error(`${prefix}expected object, got ${describe(input)}`);

	const reasons: string[] = [];
	for (const key of Object.keys(input)) {
		if (key !== "tasks") reasons.push(`unknown key ${JSON.stringify(key)}`);
	}

	const raw = input.tasks;
	const tasks: Task[] = [];
	if (Array.isArray(raw)) {
		if (raw.length > options.maxTasks)
			reasons.push(`tasks has ${raw.length} items, max is ${options.maxTasks}`);
		if (options.requireSingleInProgress === true) {
			// 只数合法项：非法 status 由逐项检查去报，不在这里重复计数
			const doing = raw.filter(
				(item) => isRecord(item) && item.status === "in_progress",
			).length;
			if (doing > 1) reasons.push(`${doing} tasks are in_progress, max is 1`);
		}
		for (const [index, item] of raw.entries()) {
			const task = checkTask(item, index + 1, options, reasons);
			if (task !== undefined) tasks.push(task);
		}
	} else {
		reasons.push(`tasks: expected array, got ${describe(raw)}`);
	}

	if (reasons.length > 0)
		throw new Error(reasons.map((reason) => prefix + reason).join("\n"));
	return tasks;
}

function checkTask(
	value: unknown,
	position: number,
	options: ValidateOptions,
	reasons: string[],
): Task | undefined {
	const at = `task ${position}: `;
	if (!isRecord(value)) {
		reasons.push(`${at}expected object, got ${describe(value)}`);
		return undefined;
	}
	const content = readContent(value.content, at, options, reasons);
	const status = readStatus(value.status, at, reasons);
	for (const key of Object.keys(value)) {
		if (key !== "content" && key !== "status")
			reasons.push(`${at}unknown key ${JSON.stringify(key)}`);
	}
	if (content === undefined || status === undefined) return undefined;
	return { content, status };
}

function readContent(
	value: unknown,
	at: string,
	options: ValidateOptions,
	reasons: string[],
): string | undefined {
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
		reasons.push(
			`${at}content is ${length} chars, max is ${options.maxContentChars}`,
		);
		ok = false;
	}
	return ok ? content : undefined;
}

function offense(char: string): string {
	const code = char.codePointAt(0) ?? 0;
	const what = /\p{Cc}/u.test(char)
		? "a control character"
		: /\p{Cf}/u.test(char)
			? "an invisible character"
			: "a line separator";
	return `${what} (U+${code.toString(16).toUpperCase().padStart(4, "0")}); ${what === "an invisible character" ? "keep it plain text" : "keep it one line"}`;
}

function readStatus(
	value: unknown,
	at: string,
	reasons: string[],
): Status | undefined {
	if (
		typeof value !== "string" ||
		!(STATUSES as readonly string[]).includes(value)
	) {
		reasons.push(
			`${at}expected one of ${STATUSES.join(" | ")}, got ${describe(value)}`,
		);
		return undefined;
	}
	return value as Status;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function countChars(value: string): number {
	return Array.from(value).length;
}

function describe(value: unknown): string {
	if (typeof value === "string") return echo(value);
	if (value === null || typeof value !== "object") return String(value);
	if (Array.isArray(value)) return `array of ${value.length}`;
	const keys = Object.keys(value);
	return `object with keys ${keys.length === 0 ? "(none)" : keys.join(", ")}`;
}

function echo(value: string): string {
	const chars = Array.from(value);
	return chars.length <= ECHO_LIMIT
		? JSON.stringify(value)
		: `${JSON.stringify(chars.slice(0, ECHO_LIMIT).join(""))}…`;
}

export function replayTasks(entries: readonly unknown[]): Task[] {
	for (let index = entries.length - 1; index >= 0; index -= 1) {
		const tasks = readSnapshot(entries[index]);
		if (tasks !== undefined) return tasks;
	}
	return [];
}

/** 快照里的换行压成空格：老账本留了换行不该让整张表消失。 */
function readSnapshot(entry: unknown): Task[] | undefined {
	if (
		!isRecord(entry) ||
		entry.type !== "custom" ||
		entry.customType !== STATE_CUSTOM_TYPE
	)
		return undefined;

	const data = entry.data;
	if (!isRecord(data) || !Array.isArray(data.tasks)) return undefined;

	const tasks: Task[] = [];
	for (const item of data.tasks) {
		if (!isRecord(item)) return undefined;
		if (typeof item.content !== "string") return undefined;
		if (
			typeof item.status !== "string" ||
			!(STATUSES as readonly string[]).includes(item.status)
		)
			return undefined;
		const content = item.content
			.replace(ESCAPE_SEQUENCE, "")
			.replace(FORBIDDEN_RUN, " ")
			.trim();
		if (content === "") return undefined;
		tasks.push({ content, status: item.status as Status });
	}
	return tasks;
}

export function formatTasks(tasks: readonly Task[]): string {
	return [
		progressLine(tasks),
		...tasks.map((task) => `${GLYPHS[task.status]} ${task.content}`),
	].join("\n");
}

function progressLine(tasks: readonly Task[]): string {
	const done = tasks.filter((task) => task.status === "completed").length;
	const doing = tasks.filter((task) => task.status === "in_progress").length;
	const counts = `Todo ${done}/${tasks.length}`;
	return doing === 0 ? counts : `${counts} · ${doing} doing`;
}
