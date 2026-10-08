import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { PLUGINS_DIST } from "./state";

const CATALOG_PATH = join(PLUGINS_DIST, "..", "reelvault-catalog.json");

/** Version the catalog build just packaged for a plugin, or undefined when unknown. */
export function readCatalogVersion(pluginId: string): string | undefined {
	try {
		const catalog = JSON.parse(readFileSync(CATALOG_PATH, "utf8")) as { plugins?: Array<{ id?: string; version?: string }> };

		return catalog.plugins?.find((plugin) => plugin.id === pluginId)?.version;
	} catch {
		return undefined;
	}
}

/**
 * Newest built zip for a plugin: the version just published to the catalog,
 * falling back to the highest versioned zip on disk. Hardcoding `-1.0.0.zip`
 * kept installing stale packages after every version bump.
 */
export function resolvePluginZip(pluginId: string): string {
	const directory = join(PLUGINS_DIST, pluginId);
	const catalogVersion = readCatalogVersion(pluginId);
	if (catalogVersion) {
		const zipPath = join(directory, `${pluginId}-${catalogVersion}.zip`);
		if (existsSync(zipPath)) return zipPath;
	}

	if (!existsSync(directory)) return join(directory, `${pluginId}-1.0.0.zip`);
	const prefix = `${pluginId}-`;
	const versions = readdirSync(directory)
		.filter((name) => name.startsWith(prefix) && name.endsWith(".zip"))
		.map((name) => name.slice(prefix.length, -".zip".length))
		.toSorted((left, right) => left.localeCompare(right, undefined, { numeric: true }));

	if (versions.length === 0) return join(directory, `${pluginId}-1.0.0.zip`);

	return join(directory, `${pluginId}-${versions[versions.length - 1]}`);
}
