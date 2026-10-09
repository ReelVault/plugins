import { describe, expect, test } from "bun:test";
import { readdir } from "node:fs/promises";
import { join } from "node:path";

const PLUGINS_ROOT = join(import.meta.dir, "..", "plugins");

/** The version a manifest declares, or undefined when the file or field is missing. */
async function declaredVersion(path: string): Promise<string | undefined> {
	const file = Bun.file(path);
	if (!(await file.exists())) return undefined;

	const parsed: unknown = JSON.parse(await file.text());
	const version = typeof parsed === "object" && parsed !== null ? Reflect.get(parsed, "version") : undefined;

	return typeof version === "string" ? version : undefined;
}

describe("plugin manifest versions", () => {
	test("ui.json and plugin.json of every plugin declare the same version", async () => {
		const mismatches: string[] = [];

		for (const name of await readdir(PLUGINS_ROOT)) {
			const pluginVersion = await declaredVersion(join(PLUGINS_ROOT, name, "plugin.json"));
			const uiVersion = await declaredVersion(join(PLUGINS_ROOT, name, "ui.json"));
			if (pluginVersion === undefined || uiVersion === undefined) continue;

			if (pluginVersion !== uiVersion) mismatches.push(`${name}: plugin.json ${pluginVersion}, ui.json ${uiVersion}`);
		}

		expect(mismatches).toEqual([]);
	});
});
