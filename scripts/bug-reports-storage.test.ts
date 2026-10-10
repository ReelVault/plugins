import { describe, expect, test } from "bun:test";
import type { BugReportsConfig } from "../plugins/bug-reports/config";
import { ReportNotFoundError, ReportPermissionError, type ReportsHost, ReportsManager } from "../plugins/bug-reports/src/reports-manager";
import type { BugReport, BugReportUser } from "../plugins/bug-reports/types";

/** The host's limit for one stored value (serverConfig.plugins.storage.maxValueBytes). */
const VALUE_LIMIT_BYTES = 64 * 1024;

const config: BugReportsConfig = { notifyAdminsOnReport: true, maxActiveReportsPerUser: 2, retentionDays: 90 };
const alice: BugReportUser = { userId: "alice" };
const bob: BugReportUser = { userId: "bob" };

// The tests do not check log output, so every logger method does nothing.
const noop = () => {
	// Intentionally empty.
};
const silentLogger: ReportsHost["logger"] = {
	trace: noop,
	debug: noop,
	info: noop,
	warn: noop,
	error: noop,
	fatal: noop,
	child: () => silentLogger,
	time: () => noop,
};

/** An in-memory host: values are cloned on write, like the real storage. */
function memoryHost(initial: Record<string, unknown> = {}) {
	const values = new Map<string, unknown>(Object.entries(initial));
	const host: ReportsHost = {
		storage: {
			get: (key) => Promise.resolve(values.get(key)),
			set: (key, value) => {
				values.set(key, structuredClone(value));

				return Promise.resolve();
			},
			update: (key, updater) => {
				const next = updater(values.get(key));
				values.set(key, next);

				return Promise.resolve(next);
			},
			delete: (key) => {
				values.delete(key);

				return Promise.resolve();
			},
		},
		logger: silentLogger,
	};

	return { host, values };
}

function legacyReport(id: string, updatedAt: string): BugReport {
	return {
		id,
		title: `Report ${id}`,
		description: "",
		category: "general",
		severity: "medium",
		status: "open",
		reportedBy: alice,
		createdAt: updatedAt,
		updatedAt,
	};
}

describe("bug report storage", () => {
	test("keeps each report under its own key and lists them all", async () => {
		const { host, values } = memoryHost();
		const manager = new ReportsManager(host, config);

		const first = await manager.createReport({ title: "Playback stutters" }, alice);
		const second = await manager.createReport({ title: "Subtitles drift" }, bob);

		expect(values.has(`bug_report:${first.id}`)).toBe(true);
		expect(values.has(`bug_report:${second.id}`)).toBe(true);
		expect((await manager.listReports()).map((report) => report.id).toSorted()).toEqual([first.id, second.id].toSorted());
	});

	test("moves reports kept in the legacy single value into per-report keys on first use", async () => {
		const { host, values } = memoryHost({ bug_reports_list: [legacyReport("r1", new Date().toISOString())] });
		const manager = new ReportsManager(host, config);

		expect((await manager.getReportById("r1"))?.title).toBe("Report r1");
		expect(values.has("bug_reports_list")).toBe(false);
		expect(values.has("bug_report:r1")).toBe(true);
	});

	test("refuses a new report once the user has the maximum of open ones", async () => {
		const { host } = memoryHost();
		const manager = new ReportsManager(host, config);
		await manager.createReport({ title: "One" }, alice);
		await manager.createReport({ title: "Two" }, alice);

		await expect(manager.createReport({ title: "Three" }, alice)).rejects.toThrow("Active report limit reached (2)");
	});

	test("checks the active-report limit against submissions that arrive together", async () => {
		const { host } = memoryHost();
		const manager = new ReportsManager(host, config);

		const results = await Promise.allSettled([
			manager.createReport({ title: "One" }, alice),
			manager.createReport({ title: "Two" }, alice),
			manager.createReport({ title: "Three" }, alice),
		]);

		expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(2);
		expect(await manager.listReports({ userId: "alice" })).toHaveLength(2);
	});

	test("lets only the reporter or an admin delete a report", async () => {
		const { host } = memoryHost();
		const manager = new ReportsManager(host, config);
		const report = await manager.createReport({ title: "Mine" }, alice);

		await expect(manager.deleteReport(report.id, "bob")).rejects.toBeInstanceOf(ReportPermissionError);
		await manager.deleteReport(report.id, "admin", true);
		await expect(manager.deleteReport(report.id, "admin", true)).rejects.toBeInstanceOf(ReportNotFoundError);
		expect(await manager.getReportById(report.id)).toBeNull();
	});

	test("keeps only the newest log characters of a report", async () => {
		const { host } = memoryHost();
		const manager = new ReportsManager(host, config);
		const logs = `${"x".repeat(20_000)}END`;

		const report = await manager.createReport({ title: "Long logs", logs }, alice);

		expect(report.logs?.length).toBe(16_000);
		expect(report.logs?.endsWith("END")).toBe(true);
	});

	test("keeps a report with the longest logs under the storage value limit", async () => {
		const { host, values } = memoryHost();
		const manager = new ReportsManager(host, config);

		// "€" takes 3 bytes in UTF-8, the widest character the logs can hold per character.
		const report = await manager.createReport({ title: "Wide logs", logs: "€".repeat(30_000) }, alice);

		const stored = values.get(`bug_report:${report.id}`);
		expect(new TextEncoder().encode(JSON.stringify(stored)).byteLength).toBeLessThan(VALUE_LIMIT_BYTES);
	});

	test("removes closed reports past retention from storage and from the index", async () => {
		const { host, values } = memoryHost();
		const manager = new ReportsManager(host, { ...config, retentionDays: 1 });
		const report = await manager.createReport({ title: "Old" }, alice);
		await manager.updateReport(report.id, { status: "closed" });
		const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
		values.set(`bug_report:${report.id}`, { ...(values.get(`bug_report:${report.id}`) as BugReport), updatedAt: threeDaysAgo });

		expect(await manager.cleanupOldReports()).toBe(1);
		expect(values.has(`bug_report:${report.id}`)).toBe(false);
		expect(values.get("bug_reports_index")).toEqual([]);
	});
});
