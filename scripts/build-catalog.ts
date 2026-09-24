#!/usr/bin/env bun
/**
 * Packages every plugin in plugins/ into a zip and generates the catalog
 * manifest (dist/reelvault-catalog.json) consumed by ReelVault servers.
 *
 * For each plugin:
 *   1. bundle index.ts with Bun (@reelvault/sdk/* stays external — the host
 *      provides the SDK itself),
 *   2. build the ui/ bundle and compile ui/schema*.ts to JSON,
 *   3. patch plugin.json to point at the bundled entry,
 *   4. zip it, hash it, append a catalog entry.
 */
import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { zipSync } from "fflate";
import { buildVersionHistory, type CatalogVersionEntry, extractArchivedVersion, resolveEntryDate } from "./catalog-history";

const ROOT = new URL("..", import.meta.url).pathname;
const PLUGINS_DIR = join(ROOT, "plugins");
const DIST_DIR = join(ROOT, "dist");
const DIST_PLUGINS_DIR = join(DIST_DIR, "plugins");
const CATALOG_FILE_NAME = "reelvault-catalog.json";
const BASE_URL = (process.env.CATALOG_BASE_URL ?? "https://raw.githubusercontent.com/ReelVault/plugins/main/dist").replace(/\/$/, "");
const SCHEMA_FILE_PATTERN = /^schema(-[a-z0-9]+)?\.ts$/;
const TYPESCRIPT_EXTENSION_PATTERN = /\.ts$/;

interface CatalogSidecar {
	category?: string;
	homepage?: string;
	changelog?: string;
	iconUrl?: string;
}

interface PluginManifest {
	id: string;
	name: string;
	version: string;
	description?: string;
	entry: string;
	capabilities?: string[];
}

interface CatalogEntry {
	id: string;
	name: string;
	version: string;
	description?: string;
	category: string;
	homepage?: string;
	iconUrl?: string;
	changelog?: string;
	downloadUrl: string;
	checksum: string;
	date?: string;
	capabilities?: string[];
	versions?: CatalogVersionEntry[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function optionalString(record: Record<string, unknown>, key: string): string | undefined {
	const value = record[key];
	return typeof value === "string" ? value : undefined;
}

function stringArray(value: unknown): string[] | undefined {
	if (!Array.isArray(value)) return undefined;
	return value.filter((item): item is string => typeof item === "string");
}

function parsePluginManifest(raw: string): PluginManifest {
	const value: unknown = JSON.parse(raw);
	if (!isRecord(value)) throw new Error("plugin.json must contain a JSON object");

	const { id, name, version, entry } = value;
	if (typeof id !== "string" || typeof name !== "string" || typeof version !== "string" || typeof entry !== "string") {
		throw new Error("plugin.json is missing required string fields (id, name, version, entry)");
	}

	const manifest: PluginManifest = { id, name, version, entry };
	const description = optionalString(value, "description");
	if (description !== undefined) manifest.description = description;

	const capabilities = stringArray(value.capabilities);
	if (capabilities !== undefined) manifest.capabilities = capabilities;

	return manifest;
}

function parseCatalogSidecar(raw: string): CatalogSidecar {
	const value: unknown = JSON.parse(raw);
	if (!isRecord(value)) return {};

	const sidecar: CatalogSidecar = {};
	const category = optionalString(value, "category");
	if (category !== undefined) sidecar.category = category;
	const homepage = optionalString(value, "homepage");
	if (homepage !== undefined) sidecar.homepage = homepage;
	const changelog = optionalString(value, "changelog");
	if (changelog !== undefined) sidecar.changelog = changelog;
	const iconUrl = optionalString(value, "iconUrl");
	if (iconUrl !== undefined) sidecar.iconUrl = iconUrl;
	return sidecar;
}

async function readCatalogSidecar(path: string): Promise<CatalogSidecar> {
	try {
		return parseCatalogSidecar(await readFile(path, "utf8"));
	} catch {
		return {};
	}
}

function isCatalogEntry(value: unknown): value is CatalogEntry {
	return isRecord(value) && typeof value.id === "string" && typeof value.version === "string" && typeof value.checksum === "string";
}

/**
 * Reads the previously published catalog so its entries can seed the version
 * history. Must run before the manifest is overwritten at the end of the build.
 */
async function readPreviousEntries(): Promise<CatalogEntry[]> {
	try {
		const parsed: unknown = JSON.parse(await readFile(join(DIST_DIR, CATALOG_FILE_NAME), "utf8"));
		if (!(isRecord(parsed) && Array.isArray(parsed.plugins))) return [];

		return parsed.plugins.filter(isCatalogEntry);
	} catch {
		return [];
	}
}

/** Checksums of previously published `<id>-<version>.zip` archives still sitting in dist. */
async function archivedChecksums(pluginId: string): Promise<Map<string, string>> {
	const checksums = new Map<string, string>();
	const pluginDistDir = join(DIST_PLUGINS_DIR, pluginId);
	let names: string[];
	try {
		names = await readdir(pluginDistDir);
	} catch {
		return checksums;
	}

	for (const name of names) {
		const version = extractArchivedVersion(name, pluginId);
		if (version === undefined || checksums.has(version)) continue;

		const zip = await readFile(join(pluginDistDir, name));
		checksums.set(version, `sha256-${createHash("sha256").update(zip).digest("hex")}`);
	}

	return checksums;
}

/**
 * Newest source modification time of a plugin (recursively, skipping build
 * output and dependency folders). Compared against the packaged zip's mtime to
 * skip repackaging plugins whose sources have not changed since.
 */
async function newestSourceMtime(sourceDir: string): Promise<number> {
	const SKIP = new Set(["node_modules", "dist", ".git"]);
	let newest = 0;
	for (const entry of await readdir(sourceDir, { withFileTypes: true })) {
		if (SKIP.has(entry.name)) continue;

		const path = join(sourceDir, entry.name);
		if (entry.isDirectory()) {
			newest = Math.max(newest, await newestSourceMtime(path));
		} else {
			newest = Math.max(newest, (await stat(path)).mtimeMs);
		}
	}

	return newest;
}

async function* walk(directory: string): AsyncGenerator<[string, Uint8Array]> {
	for (const entry of await readdir(directory, { withFileTypes: true })) {
		const path = join(directory, entry.name);
		if (entry.isDirectory()) {
			yield* walk(path);
		} else if (entry.isFile()) {
			yield [path, new Uint8Array(await readFile(path))];
		}
	}
}

async function bundle(source: string, outdir: string): Promise<void> {
	const proc = Bun.spawn(["bun", "build", source, "--outdir", outdir, "--target", "bun", "--external", "@reelvault/sdk"], {
		cwd: ROOT,
		stdout: "inherit",
		stderr: "inherit",
	});
	const code = await proc.exited;
	if (code !== 0) throw new Error(`bun build failed for ${source} (exit ${code})`);
}

/**
 * Builds a plugin's frontend bundle. The author ships `ui/` with its own
 * package.json; `bun run build` must emit `ui/dist`. Plugins without a `ui/`
 * directory may instead commit a prebuilt `dist/ui` — both are copied into the
 * package under `dist/ui`.
 */
async function buildPluginUi(sourceDir: string): Promise<void> {
	const uiDir = join(sourceDir, "ui");
	if (!(await Bun.file(join(uiDir, "package.json")).exists())) return;

	const install = Bun.spawn(["bun", "install"], {
		cwd: uiDir,
		stdout: "inherit",
		stderr: "inherit",
	});
	if ((await install.exited) !== 0) throw new Error(`bun install failed for UI in ${uiDir}`);

	// Schema-only plugins have no custom-element entry to bundle.
	if (!(await Bun.file(join(uiDir, "src", "index.tsx")).exists())) return;

	const build = Bun.spawn(["bun", "run", "build"], {
		cwd: uiDir,
		stdout: "inherit",
		stderr: "inherit",
	});
	if ((await build.exited) !== 0) throw new Error(`UI build failed for ${uiDir}`);
}

/**
 * Compiles every type-safe schema module (`ui/schema.ts`, `ui/schema-*.ts`) to
 * `ui/dist/<name>.json`, which the plugin's `ui.json` references via `schemaRef`.
 * Each module default-exports a schema produced by `@reelvault/sdk/ui` builders.
 */
async function buildPluginSchema(sourceDir: string): Promise<void> {
	const uiDir = join(sourceDir, "ui");
	if (!(await isDirectory(uiDir))) return;

	const schemaFiles = (await readdir(uiDir, { withFileTypes: true })).filter(
		(entry) => entry.isFile() && SCHEMA_FILE_PATTERN.test(entry.name),
	);
	if (schemaFiles.length === 0) return;

	const outDir = join(uiDir, "dist");
	await mkdir(outDir, { recursive: true });
	for (const file of schemaFiles) {
		const source = join(uiDir, file.name);
		const module: unknown = await import(`${source}?build=${Date.now()}`);
		const schema = module && typeof module === "object" && "default" in module ? module.default : undefined;
		if (!schema || typeof schema !== "object") throw new Error(`ui/${file.name} must default-export a schema object`);

		const outName = file.name.replace(TYPESCRIPT_EXTENSION_PATTERN, ".json");
		await Bun.write(join(outDir, outName), `${JSON.stringify(schema, null, "\t")}\n`);
	}
}

async function isDirectory(path: string): Promise<boolean> {
	try {
		return (await stat(path)).isDirectory();
	} catch {
		return false;
	}
}

async function resolveUiDist(sourceDir: string): Promise<string | null> {
	const candidates = [join(sourceDir, "ui", "dist"), join(sourceDir, "dist", "ui")];
	for (const candidate of candidates) {
		if (await isDirectory(candidate)) return candidate;
	}
	return null;
}

async function stageUiAssets(sourceDist: string, stagingDir: string): Promise<void> {
	const target = join(stagingDir, "dist", "ui");
	await mkdir(target, { recursive: true });
	for await (const [path, bytes] of walk(sourceDist)) {
		const relative = path.slice(sourceDist.length + 1).replaceAll("\\", "/");
		await Bun.write(join(target, relative), bytes);
	}
}

const catalogEntries: CatalogEntry[] = [];
const previousEntries = await readPreviousEntries();

for (const pluginDirName of (await readdir(PLUGINS_DIR, { withFileTypes: true }))
	.filter((entry) => entry.isDirectory())
	.map((entry) => entry.name)) {
	const sourceDir = join(PLUGINS_DIR, pluginDirName);
	const manifest = parsePluginManifest(await readFile(join(sourceDir, "plugin.json"), "utf8"));
	const sidecar = await readCatalogSidecar(join(sourceDir, "catalog.json"));
	const previous = previousEntries.find((candidate) => candidate.id === manifest.id);

	const zipName = `${manifest.id}-${manifest.version}.zip`;
	const zipPath = join(DIST_PLUGINS_DIR, manifest.id, zipName);
	const entryBase = {
		id: manifest.id,
		name: manifest.name,
		version: manifest.version,
		...(manifest.description ? { description: manifest.description } : {}),
		category: sidecar.category ?? "other",
		...(sidecar.homepage ? { homepage: sidecar.homepage } : {}),
		...(sidecar.iconUrl ? { iconUrl: sidecar.iconUrl } : {}),
		...(sidecar.changelog ? { changelog: sidecar.changelog } : {}),
		...(manifest.capabilities ? { capabilities: manifest.capabilities } : {}),
	};

	// A zip newer than every source file is already the current release —
	// repackaging would only churn timestamps (and burn CI minutes).
	if ((await Bun.file(zipPath).exists()) && (await stat(zipPath)).mtimeMs >= (await newestSourceMtime(sourceDir))) {
		const zip = await readFile(zipPath);
		catalogEntries.push({
			...entryBase,
			downloadUrl: `${BASE_URL}/plugins/${manifest.id}/${zipName}`,
			checksum: `sha256-${createHash("sha256").update(zip).digest("hex")}`,
			date: resolveEntryDate(previous, manifest.version),
		});
		console.log(`already packaged ${manifest.id}@${manifest.version} (sources unchanged)`);
		continue;
	}

	const stagingDir = join(DIST_DIR, ".build", manifest.id);
	await rm(stagingDir, { recursive: true, force: true });
	await mkdir(stagingDir, { recursive: true });

	const entrySource = join(sourceDir, manifest.entry);
	if (await Bun.file(join(sourceDir, "package.json")).exists()) {
		const install = Bun.spawn(["bun", "install"], {
			cwd: sourceDir,
			stdout: "inherit",
			stderr: "inherit",
		});
		if ((await install.exited) !== 0) throw new Error(`bun install failed for ${manifest.id}`);
	}
	await bundle(entrySource, stagingDir);
	const bundledEntry = `./${manifest.entry.replace(/\.(ts|tsx)$/, ".js")}`;

	const stagedManifest: PluginManifest = {
		...manifest,
		entry: bundledEntry,
	};
	await Bun.write(join(stagingDir, "plugin.json"), JSON.stringify(stagedManifest, null, "\t"));
	if (await Bun.file(join(sourceDir, "ui.json")).exists()) {
		await Bun.write(join(stagingDir, "ui.json"), await Bun.file(join(sourceDir, "ui.json")).arrayBuffer());
	}

	// Frontend: build the plugin's own web bundle (ui/) and pack it under dist/ui.
	// Rebuild UI output from scratch so removed bundles/schemas don't linger in the zip.
	await rm(join(sourceDir, "ui", "dist"), { recursive: true, force: true });
	await buildPluginUi(sourceDir);
	await buildPluginSchema(sourceDir);
	const uiDist = await resolveUiDist(sourceDir);
	if (uiDist) await stageUiAssets(uiDist, stagingDir);

	const files: Record<string, Uint8Array> = {};
	for await (const [path, bytes] of walk(stagingDir)) {
		files[`${manifest.id}/${path.slice(stagingDir.length + 1).replaceAll("\\", "/")}`] = bytes;
	}
	const zip = zipSync(files);
	const checksum = `sha256-${createHash("sha256").update(zip).digest("hex")}`;
	await mkdir(join(DIST_PLUGINS_DIR, manifest.id), { recursive: true });
	await Bun.write(zipPath, zip);

	catalogEntries.push({
		...entryBase,
		downloadUrl: `${BASE_URL}/plugins/${manifest.id}/${zipName}`,
		checksum,
		date: resolveEntryDate(previous, manifest.version),
	});

	console.log(`packaged ${manifest.id}@${manifest.version} → ${zipName} (${zip.byteLength} bytes)`);
}

await rm(join(DIST_DIR, ".build"), { recursive: true, force: true });

const previousById = new Map(previousEntries.map((entry) => [entry.id, entry] as const));
for (const entry of catalogEntries) {
	const versions = buildVersionHistory(entry.id, entry.version, previousById.get(entry.id), await archivedChecksums(entry.id), BASE_URL);
	if (versions.length > 0) entry.versions = versions;
}

catalogEntries.sort((left, right) => left.id.localeCompare(right.id));
const manifest = {
	apiVersion: 1,
	name: "ReelVault Official",
	plugins: catalogEntries,
};
await Bun.write(join(DIST_DIR, CATALOG_FILE_NAME), `${JSON.stringify(manifest, null, "\t")}\n`);
console.log(`wrote ${CATALOG_FILE_NAME} with ${catalogEntries.length} plugins`);
