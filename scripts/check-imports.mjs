/**
 * docs/SPEC.md「模块」一节的机读版：依赖方向边表 + 单一出口 + 「src/ 不建目录」。
 * 规则改了先改 SPEC.md，再改这里的 EDGES / SINGLE_IMPORT；两边不一致 CI 会红。
 */

import { readdirSync, readFileSync } from "node:fs";

/** 允许的跨文件边：文件 -> 它可以直接 import 的文件（src/ 平铺，模块名即文件名）。 */
const EDGES = {
	config: [],
	plan: [],
	view: ["plan"],
	index: ["config", "plan", "view"],
};

/** 只允许出现在指定文件的依赖；typeOnlyIn 里的文件必须写成 `import type`。 */
const SINGLE_IMPORT = [
	{
		specifier: /^@earendil-works\//,
		only: ["index.ts"],
		typeOnlyIn: ["index.ts"],
	},
	{ specifier: /^typebox$/, only: ["index.ts"] },
	{ specifier: /^node:/, only: ["config.ts", "index.ts"] },
	// 引用 plan.ts 的方向由 EDGES 判，这里只钉 `view.ts` 拿的是类型不是实现。
	{ specifier: /^\.\/plan\.ts$/, typeOnlyIn: ["view.ts"] },
];

const IMPORT = /^import\s+(type\s+)?(?:[\w*{}\s,$]+from\s+)?["']([^"']+)["']/gm;

const failures = [];
const entries = readdirSync("src", { withFileTypes: true });
for (const entry of entries) {
	if (entry.isDirectory()) {
		failures.push(`src/${entry.name}/: src/ 下不建目录（docs/SPEC.md）`);
	}
}

const files = entries
	.filter((entry) => entry.isFile() && entry.name.endsWith(".ts"))
	.map((entry) => entry.name)
	.sort();

const moduleOf = (file) => file.replace(/\.ts$/, "");

for (const file of files) {
	const from = moduleOf(file);
	if (!(from in EDGES)) {
		failures.push(
			`src/${file}: 未登记的模块——新增文件要同时改 EDGES 与 docs/SPEC.md`,
		);
		continue;
	}
	for (const [, typeOnly, spec] of readFileSync(
		`src/${file}`,
		"utf-8",
	).matchAll(IMPORT)) {
		for (const rule of SINGLE_IMPORT) {
			if (!rule.specifier.test(spec)) continue;
			if (rule.only !== undefined && !rule.only.includes(file)) {
				failures.push(
					`src/${file}: ${spec} 只允许出现在 ${rule.only.map((f) => `src/${f}`).join("、")}`,
				);
			} else if (typeOnly === undefined && rule.typeOnlyIn?.includes(file)) {
				failures.push(`src/${file}: ${spec} 必须写成 import type`);
			}
		}
		if (!spec.startsWith(".")) continue;
		const to = moduleOf(spec.replace(/^\.\//, ""));
		if (to === from || EDGES[from].includes(to)) continue;
		const allowed =
			EDGES[from].length === 0 ? "不 import 任何文件" : EDGES[from].join("、");
		failures.push(
			`src/${file}: 引用了 src/${to}.ts（${from} 只允许：${allowed}）`,
		);
	}
}

if (failures.length > 0) {
	console.error("import 图违反 docs/SPEC.md「模块」一节：");
	for (const failure of failures) console.error(`  ${failure}`);
	process.exit(1);
}
console.log(`ok: ${files.length} files`);
