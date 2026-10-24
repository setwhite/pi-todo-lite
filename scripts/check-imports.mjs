/** docs/ARCHITECTURE.md「依赖方向」与「放置规则」的机读版。 */

import { readdirSync, readFileSync } from "node:fs";

const EDGES = {
	config: [],
	plan: [],
	view: ["plan"],
	index: ["config", "plan", "view"],
};

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
		failures.push(
			`src/${entry.name}/: src/ 下不建目录（docs/ARCHITECTURE.md）`,
		);
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
			`src/${file}: 未登记的模块——新增文件要同时改 EDGES 与 docs/ARCHITECTURE.md`,
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
	console.error("import 图违反 docs/ARCHITECTURE.md「模块」一节：");
	for (const failure of failures) console.error(`  ${failure}`);
	process.exit(1);
}
console.log(`ok: ${files.length} files`);
