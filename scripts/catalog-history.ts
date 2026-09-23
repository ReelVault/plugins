/**
 * Pure version-history logic for the catalog builder: merging previously
 * published versions of a plugin into the `versions[]` catalog field that
 * powers admin-side rollbacks.
 */

export interface CatalogVersionEntry {
	version: string;
	date?: string;
	changelog?: string;
	downloadUrl: string;
	checksum: string;
}

/** The slice of a previously published catalog entry that the history needs. */
export interface CatalogHistoryEntry {
	version: string;
	date?: string;
	changelog?: string;
	checksum: string;
	versions?: CatalogVersionEntry[];
}

const VERSION_PATTERN = /^\d+\.\d+\.\d+(?:[-+][A-Za-z0-9.-]+)?$/;
const ZIP_EXTENSION = ".zip";

export function isSemverVersion(value: string): boolean {
	return VERSION_PATTERN.test(value);
}

/** Extracts the semver version from a published `<pluginId>-<version>.zip` name. */
export function extractArchivedVersion(zipName: string, pluginId: string): string | undefined {
	const prefix = `${pluginId}-`;
	if (!(zipName.startsWith(prefix) && zipName.endsWith(ZIP_EXTENSION))) return undefined;

	const version = zipName.slice(prefix.length, -ZIP_EXTENSION.length);
	return isSemverVersion(version) ? version : undefined;
}

/**
 * The publish date is stamped once per version and preserved on rebuilds, so
 * repackaging a plugin does not make it look freshly released.
 */
export function resolveEntryDate(previous: CatalogHistoryEntry | undefined, currentVersion: string): string {
	if (previous?.version === currentVersion && previous.date !== undefined) return previous.date;

	return new Date().toISOString();
}

/** The public download URL of an archived release inside the dist folder layout. */
export function archiveUrl(baseUrl: string, pluginId: string, version: string): string {
	return `${baseUrl}/plugins/${pluginId}/${pluginId}-${version}.zip`;
}

/**
 * Builds the `versions[]` list (newest first) for a catalog entry. Sources, in
 * priority order: the previous catalog's latest entry, its recorded history,
 * and archived dist zips — whose checksums are recomputed on the spot because
 * versions published before history tracking have no recorded digest.
 * Download URLs are rebuilt from the current base so a repository rename does
 * not strand old versions.
 */
export function buildVersionHistory(
	pluginId: string,
	currentVersion: string,
	previous: CatalogHistoryEntry | undefined,
	archivedChecksums: ReadonlyMap<string, string>,
	baseUrl: string,
): CatalogVersionEntry[] {
	const history = new Map<string, CatalogVersionEntry>();
	const record = (entry: CatalogVersionEntry): void => {
		if (entry.version === currentVersion || !isSemverVersion(entry.version) || history.has(entry.version)) return;

		history.set(entry.version, entry);
	};

	if (previous) record(toVersionEntry(previous, pluginId, baseUrl));
	for (const entry of previous?.versions ?? []) record(toVersionEntry(entry, pluginId, baseUrl));

	for (const [version, checksum] of archivedChecksums) {
		if (version === currentVersion || !isSemverVersion(version)) continue;

		const known = history.get(version);
		const rebuilt: CatalogVersionEntry = {
			version,
			downloadUrl: archiveUrl(baseUrl, pluginId, version),
			checksum,
		};
		if (known?.date !== undefined) rebuilt.date = known.date;
		if (known?.changelog !== undefined) rebuilt.changelog = known.changelog;
		history.set(version, rebuilt);
	}

	return [...history.values()].toSorted((left, right) => Bun.semver.order(right.version, left.version));
}

function toVersionEntry(entry: CatalogHistoryEntry, pluginId: string, baseUrl: string): CatalogVersionEntry {
	const version: CatalogVersionEntry = {
		version: entry.version,
		downloadUrl: archiveUrl(baseUrl, pluginId, entry.version),
		checksum: entry.checksum,
	};
	if (entry.date !== undefined) version.date = entry.date;
	if (entry.changelog !== undefined) version.changelog = entry.changelog;

	return version;
}
