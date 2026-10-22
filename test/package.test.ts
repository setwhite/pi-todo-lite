/**
 * 发布物断言：`files` 决定哪些文件随包发布，改错了本地全绿、只有装包的用户会崩。
 * 只读 git 索引与 package.json，不联网、不打包。
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

interface PackageJson {
	files: string[];
	pi: { extensions: string[] };
}

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const pkg: PackageJson = JSON.parse(
	readFileSync(join(repoRoot, "package.json"), "utf-8"),
);

const tracked = execFileSync("git", ["ls-files"], {
	cwd: repoRoot,
	encoding: "utf-8",
})
	.split("\n")
	.filter(Boolean)
	.map((path) => path.replaceAll("\\", "/"));

/** 是否随包发布：`files` 的每一项既可以是文件，也可以是目录前缀。 */
const shipped = (path: string): boolean =>
	pkg.files.some((entry) => path === entry || path.startsWith(`${entry}/`));

/** 开发期专用、不进包：测试、守卫脚本与文档。 */
const development = (path: string): boolean =>
	["test/", "scripts/", "docs/"].some((prefix) => path.startsWith(prefix));

describe("发布物", () => {
	it("生产代码全部落在 files 里（新增顶层文件或目录忘了加会在这里红）", () => {
		const missing = tracked.filter(
			(file) => file.endsWith(".ts") && !development(file) && !shipped(file),
		);
		expect(missing).toEqual([]);
	});

	it("test/ 与 docs/ 不进包", () => {
		const leaked = tracked.filter(
			(file) =>
				(file.startsWith("test/") || file.startsWith("docs/")) && shipped(file),
		);
		expect(leaked).toEqual([]);
	});

	it("files 的每一项都命中至少一个文件", () => {
		const empty = pkg.files.filter(
			(entry) =>
				!tracked.some((file) => file === entry || file.startsWith(`${entry}/`)),
		);
		expect(empty).toEqual([]);
	});

	it("pi.extensions 指向的入口存在且随包发布", () => {
		const entry = pkg.pi.extensions[0].replace("./", "");
		expect(tracked).toContain(entry);
		expect(shipped(entry)).toBe(true);
	});
});
