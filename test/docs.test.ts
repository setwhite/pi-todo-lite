import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DEFAULTS } from "../config.ts";

/**
 * `docs/CONFIG.md` 与 `config.ts` 的三处对账（T12）：
 * 键表 / `DEFAULTS` / 样例 JSON 谁都不能单飞。文档是唯一副本，这里只把螺丝拧紧。
 */
const DOC = readFileSync(new URL("../docs/CONFIG.md", import.meta.url), "utf-8");

/** 键表的 `| key | 默认 | …` 行：键 → 默认值单元格原文（去掉包着的 code span）。 */
function documentedKeys(): Map<string, string> {
	const rows = new Map<string, string>();
	for (const line of DOC.split("\n")) {
		const match = /^\| `([^`]+)` \| ([^|]*) \|/.exec(line);
		const key = match?.[1];
		if (key === undefined) continue;
		const cell = (match?.[2] ?? "").trim();
		rows.set(key, /^`[\s\S]*`$/.test(cell) ? cell.slice(1, -1) : cell);
	}
	return rows;
}

/** 所有叶子路径（标准摊平：数组与标量都是叶子）。键表可以把 `glyphs` 这种子对象写成一行。 */
function leafPaths(value: unknown, prefix = ""): string[] {
	return Object.entries(value as Record<string, unknown>).flatMap(([key, item]) => {
		const path = prefix === "" ? key : `${prefix}.${key}`;
		return item !== null && typeof item === "object" && !Array.isArray(item) ? leafPaths(item, path) : [path];
	});
}

/** 按 `a.b.c` 取值；`found` 为 false 表示这个路径不存在。 */
function atPath(root: unknown, path: string): { found: boolean; value: unknown } {
	let current: unknown = root;
	for (const part of path.split(".")) {
		if (current === null || typeof current !== "object" || !(part in current)) return { found: false, value: undefined };
		current = (current as Record<string, unknown>)[part];
	}
	return { found: true, value: current };
}

/** `a.b.c` 自己 + 所有祖先路径（`a` / `a.b` / `a.b.c`）。 */
function ancestors(path: string): string[] {
	const parts = path.split(".");
	return parts.map((_, index) => parts.slice(0, index + 1).join("."));
}

/** 表里对象写成 JS 字面量（键名不带引号）：补上引号再当 JSON 读。 */
function asJson(cell: string): unknown {
	return JSON.parse(cell.replace(/([{,]\s*)([A-Za-z_][A-Za-z0-9_]*)\s*:/g, '$1"$2":'));
}

/** 文档末尾那份「写满的样例」JSON 代码块。 */
function sampleJson(): unknown {
	const match = /```json\n([\s\S]*?)```/.exec(DOC);
	if (match?.[1] === undefined) throw new Error("docs/CONFIG.md 里没找到 json 代码块");
	return JSON.parse(match[1]);
}

const DOC_KEYS = documentedKeys();
const LEAVES = leafPaths(DEFAULTS);
const SAMPLE = sampleJson();

describe("docs/CONFIG.md 与 config.ts 对账", () => {
	it("键表正好 21 行，且每个叶子键都有登记（glyphs 这种子对象允许写成一行）", () => {
		expect(DOC_KEYS.size).toBe(21);

		// 每个叶子：自己或者它的某个祖先在表里
		expect(LEAVES.filter((path) => !ancestors(path).some((ancestor) => DOC_KEYS.has(ancestor)))).toEqual([]);
		// 反向：表里每一行都得管着至少一个叶子（没有「只写在文档里没实现」的键）
		expect([...DOC_KEYS.keys()].filter((key) => !LEAVES.some((path) => path === key || path.startsWith(`${key}.`)))).toEqual([]);
	});

	it("键表里的默认值与 DEFAULTS 逐字一致；剩下三格是散文，点名看着", () => {
		const prose: string[] = [];

		for (const [path, cell] of DOC_KEYS) {
			let parsed: unknown;
			try {
				parsed = asJson(cell);
			} catch {
				prose.push(path);
				continue;
			}
			expect(parsed, path).toEqual(atPath(DEFAULTS, path).value);
		}

		// 「false（默认放开并行）」「我们的成品（…）」这几格写不进 JSON，只能点名
		expect(prose).toEqual(["plan.requireSingleInProgress", "guidance.description", "guidance.promptGuidelines"]);
	});

	it("样例 JSON 的每个键都在 DEFAULTS 里，值逐字一致（guidance 三格是占位符）", () => {
		for (const path of leafPaths(SAMPLE)) {
			expect(atPath(DEFAULTS, path).found, path).toBe(true);
			if (path.startsWith("guidance.")) continue;
			expect(atPath(SAMPLE, path).value, path).toEqual(atPath(DEFAULTS, path).value);
		}
		expect(leafPaths(SAMPLE)).toHaveLength(23);
	});
});
