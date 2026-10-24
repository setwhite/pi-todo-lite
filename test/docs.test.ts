import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DEFAULTS } from "../src/config.ts";

// Windows 检出默认 core.autocrlf=true，文件到手是 CRLF —— 解析前先归一
const read = (name: string): string =>
	readFileSync(new URL(`../${name}`, import.meta.url), "utf-8").replaceAll(
		"\r\n",
		"\n",
	);

const ZH = read("README.md");
const EN = read("README.en.md");

/** 字符串里的 `//` 不算。 */
function stripComments(source: string): string {
	const out: string[] = [];
	for (const line of source.split("\n")) {
		let inString = false;
		let cut = line.length;
		for (let i = 0; i < line.length; i += 1) {
			const char = line[i];
			if (inString) {
				if (char === "\\") i += 1;
				else if (char === '"') inString = false;
			} else if (char === '"') inString = true;
			else if (char === "/" && line[i + 1] === "/") {
				cut = i;
				break;
			}
		}
		out.push(line.slice(0, cut));
	}
	return out.join("\n");
}

function sample(doc: string, label: string): unknown {
	const block = /```jsonc\n([\s\S]*?)```/.exec(doc)?.[1];
	if (block === undefined) throw new Error(`${label} 里没找到 jsonc 代码块`);
	return JSON.parse(stripComments(block));
}

function leafPaths(value: unknown, prefix = ""): string[] {
	return Object.entries(value as Record<string, unknown>).flatMap(
		([key, item]) => {
			const path = prefix === "" ? key : `${prefix}.${key}`;
			return item !== null && typeof item === "object" && !Array.isArray(item)
				? leafPaths(item, path)
				: [path];
		},
	);
}

function atPath(
	root: unknown,
	path: string,
): { found: boolean; value: unknown } {
	let current: unknown = root;
	for (const part of path.split(".")) {
		if (current === null || typeof current !== "object" || !(part in current))
			return { found: false, value: undefined };
		current = (current as Record<string, unknown>)[part];
	}
	return { found: true, value: current };
}

const ZH_SAMPLE = sample(ZH, "README.md");
const EN_SAMPLE = sample(EN, "README.en.md");

describe("README 的配置示例与 config.ts 对账", () => {
	it("示例的键正好是 DEFAULTS 的键，值逐字一致（guidance 三格是占位符）", () => {
		const leaves = leafPaths(DEFAULTS).sort();
		expect(leafPaths(ZH_SAMPLE).sort()).toEqual(leaves);

		for (const path of leaves) {
			if (path.startsWith("guidance.")) continue;
			expect(atPath(ZH_SAMPLE, path).value, path).toEqual(
				atPath(DEFAULTS, path).value,
			);
		}
	});

	it("英文 README 的示例与中文解析出同一个对象", () => {
		expect(EN_SAMPLE).toEqual(ZH_SAMPLE);
	});
});
