import { describe, expect, test } from "bun:test";
import { buildVersionHistory, extractArchivedVersion, resolveEntryDate } from "./catalog-history";

const BASE_URL = "https://example.com/dist";

describe("extractArchivedVersion", () => {
	test("extracts a semver version from a published zip name", () => {
		expect(extractArchivedVersion("org.reelvault.requests-1.1.0.zip", "org.reelvault.requests")).toBe("1.1.0");
	});

	test("rejects a foreign prefix, wrong extension or a non-semver tail", () => {
		expect(extractArchivedVersion("org.reelvault.tmdb-1.0.0.zip", "org.reelvault.requests")).toBeUndefined();
		expect(extractArchivedVersion("org.reelvault.requests-1.0.0.tar.gz", "org.reelvault.requests")).toBeUndefined();
		expect(extractArchivedVersion("org.reelvault.requests-latest.zip", "org.reelvault.requests")).toBeUndefined();
	});
});

describe("resolveEntryDate", () => {
	test("preserves the recorded date when rebuilding the same version", () => {
		const previous = { version: "1.0.0", date: "2026-09-01T00:00:00.000Z", checksum: "sha256-a" };
		expect(resolveEntryDate(previous, "1.0.0")).toBe("2026-09-01T00:00:00.000Z");
	});

	test("stamps a fresh ISO date for a new version", () => {
		const date = resolveEntryDate({ version: "1.0.0", checksum: "sha256-a" }, "1.1.0");
		expect(Number.isNaN(Date.parse(date))).toBe(false);
	});
});

describe("buildVersionHistory", () => {
	test("collects the previous latest, its recorded history and archived zips, newest first", () => {
		const previous = {
			version: "1.1.0",
			date: "2026-09-01T00:00:00.000Z",
			changelog: "Middle release",
			checksum: `sha256-${"1".repeat(64)}`,
			versions: [
				{
					version: "1.0.0",
					date: "2026-08-01T00:00:00.000Z",
					changelog: "First release",
					downloadUrl: "https://old.example.com/org.x-1.0.0.zip",
					checksum: `sha256-${"0".repeat(64)}`,
				},
			],
		};
		const history = buildVersionHistory("org.x", "1.2.0", previous, new Map([["0.9.0", `sha256-${"9".repeat(64)}`]]), BASE_URL);

		expect(history.map((entry) => entry.version)).toEqual(["1.1.0", "1.0.0", "0.9.0"]);
		expect(history[0]?.date).toBe("2026-09-01T00:00:00.000Z");
		expect(history[0]?.changelog).toBe("Middle release");
		expect(history[0]?.downloadUrl).toBe(`${BASE_URL}/plugins/org.x/org.x-1.1.0.zip`);
		expect(history[1]?.downloadUrl).toBe(`${BASE_URL}/plugins/org.x/org.x-1.0.0.zip`);
		expect(history[1]?.date).toBe("2026-08-01T00:00:00.000Z");
		expect(history[2]?.checksum).toBe(`sha256-${"9".repeat(64)}`);
	});

	test("drops the current version even when present in previous data and skips junk archive names", () => {
		const previous = { version: "1.1.0", checksum: `sha256-${"1".repeat(64)}` };
		const history = buildVersionHistory(
			"org.x",
			"1.1.0",
			previous,
			new Map([
				["1.1.0", `sha256-${"2".repeat(64)}`],
				["bogus", `sha256-${"3".repeat(64)}`],
			]),
			BASE_URL,
		);

		expect(history).toHaveLength(0);
	});

	test("keeps recorded changelog metadata when rehashing an archived zip", () => {
		const previous = {
			version: "1.1.0",
			changelog: "Middle release",
			checksum: `sha256-${"1".repeat(64)}`,
			versions: [],
		};
		const history = buildVersionHistory("org.x", "1.2.0", previous, new Map([["1.1.0", `sha256-${"2".repeat(64)}`]]), BASE_URL);

		expect(history).toHaveLength(1);
		expect(history[0]?.changelog).toBe("Middle release");
		expect(history[0]?.checksum).toBe(`sha256-${"2".repeat(64)}`);
		expect(history[0]?.downloadUrl).toBe(`${BASE_URL}/plugins/org.x/org.x-1.1.0.zip`);
	});
});
