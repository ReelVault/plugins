import type { PluginHost, PluginStorage } from "@reelvault/sdk/plugin";
import type { BugReportsConfig } from "../config";
import type {
	BugReport,
	BugReportCategory,
	BugReportSeverity,
	BugReportStatus,
	BugReportUser,
	CreateBugReportInput,
	ReportsSummary,
	UpdateBugReportInput,
} from "../types";

/** One key per report, so no single stored value grows with the number of reports. */
const REPORT_KEY_PREFIX = "bug_report:";
/** The ids of every stored report. It is one value, so it is capped at MAX_STORED_REPORTS. */
const INDEX_KEY = "bug_reports_index";
/** Where earlier versions kept every report in one value; moved to per-report keys on first use. */
const LEGACY_LIST_KEY = "bug_reports_list";
/** ~1500 report ids stay under the 64 KiB value limit of the index. */
const MAX_STORED_REPORTS = 1_500;
/** Newest log characters kept per report. At 3 bytes each in UTF-8 they stay under the 64 KiB value limit with the other fields. */
const MAX_LOG_CHARS = 16_000;
/** Reports read per round of storage calls. */
const READ_BATCH_SIZE = 20;

/** The report id does not match any stored report. */
export class ReportNotFoundError extends Error {}

/** The caller may not act on this report. */
export class ReportPermissionError extends Error {}

/** The host surface the reports need: keyed storage and the logger. */
export interface ReportsHost {
	storage: Pick<PluginStorage, "get" | "set" | "update" | "delete">;
	logger: PluginHost["logger"];
}

export class ReportsManager {
	private readonly host: ReportsHost;
	private readonly config: BugReportsConfig;
	private migration?: Promise<void>;
	/** Writes run one after another, so the active-report limit is checked against the state it changes. */
	private writeQueue: Promise<unknown> = Promise.resolve();

	constructor(host: ReportsHost, config: BugReportsConfig) {
		this.host = host;
		this.config = config;
	}

	async getAllReports(): Promise<BugReport[]> {
		return await this.readReports(await this.readIndex());
	}

	async getReportById(id: string): Promise<BugReport | null> {
		await this.ensureMigrated();
		return (await this.readReport(id)) ?? null;
	}

	async listReports(filters?: {
		userId?: string;
		status?: BugReportStatus | "all";
		category?: BugReportCategory | "all";
		severity?: BugReportSeverity | "all";
		search?: string;
	}): Promise<BugReport[]> {
		let all = await this.getAllReports();

		if (filters?.userId) {
			all = all.filter((r) => r.reportedBy.userId === filters.userId);
		}
		if (filters?.status && filters.status !== "all") {
			all = all.filter((r) => r.status === filters.status);
		}
		if (filters?.category && filters.category !== "all") {
			all = all.filter((r) => r.category === filters.category);
		}
		if (filters?.severity && filters.severity !== "all") {
			all = all.filter((r) => r.severity === filters.severity);
		}
		if (filters?.search && filters.search.trim().length > 0) {
			const q = filters.search.toLowerCase().trim();
			all = all.filter(
				(r) =>
					r.title.toLowerCase().includes(q) ||
					r.description.toLowerCase().includes(q) ||
					(r.mediaTitle?.toLowerCase().includes(q) ?? false) ||
					(r.pageUrl?.toLowerCase().includes(q) ?? false),
			);
		}

		return all.toSorted((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
	}

	async createReport(input: CreateBugReportInput, user: BugReportUser): Promise<BugReport> {
		const now = new Date().toISOString();
		const newReport: BugReport = {
			id: crypto.randomUUID(),
			title: input.title.trim(),
			description: (input.description ?? "").trim(),
			category: input.category ?? "general",
			severity: input.severity ?? "medium",
			status: "open",
			pageUrl: input.pageUrl,
			mediaId: input.mediaId,
			mediaTitle: input.mediaTitle,
			deviceInfo: input.deviceInfo,
			logs: input.logs?.slice(-MAX_LOG_CHARS),
			reportedBy: user,
			createdAt: now,
			updatedAt: now,
		};

		await this.serialize(async () => {
			await this.ensureMigrated();
			const ids = await this.readIndex();
			if (ids.length >= MAX_STORED_REPORTS) {
				throw new Error(`Report storage is full (${MAX_STORED_REPORTS} reports). Delete closed reports first.`);
			}

			const activeReportsCount = (await this.readReports(ids)).filter(
				(r) => r.reportedBy.userId === user.userId && (r.status === "open" || r.status === "in_progress"),
			).length;
			if (activeReportsCount >= this.config.maxActiveReportsPerUser) {
				throw new Error(`Active report limit reached (${this.config.maxActiveReportsPerUser}). Wait for earlier reports to be resolved.`);
			}

			await this.host.storage.set(this.reportKey(newReport.id), newReport);
			await this.host.storage.update(INDEX_KEY, (current) => appendId(current, newReport.id));
		});

		if ((input.logs?.length ?? 0) > MAX_LOG_CHARS) {
			this.host.logger.info("Bug report logs were trimmed to their newest characters", { id: newReport.id, maxChars: MAX_LOG_CHARS });
		}
		this.host.logger.info("New bug report created", {
			id: newReport.id,
			category: newReport.category,
			severity: newReport.severity,
			userId: user.userId,
		});

		return newReport;
	}

	async updateReport(id: string, input: UpdateBugReportInput): Promise<BugReport> {
		return await this.serialize(async () => {
			await this.ensureMigrated();
			const stored = await this.host.storage.update(this.reportKey(id), (current) => {
				if (!isBugReport(current)) {
					throw new ReportNotFoundError(`Report with ID "${id}" does not exist.`);
				}

				const now = new Date().toISOString();
				const updatedStatus = input.status ?? current.status;
				const isResolving =
					(updatedStatus === "resolved" || updatedStatus === "closed") && current.status !== "resolved" && current.status !== "closed";

				return {
					...current,
					...(input.status ? { status: input.status } : {}),
					...(input.severity ? { severity: input.severity } : {}),
					...(input.adminNotes !== undefined ? { adminNotes: input.adminNotes } : {}),
					...(isResolving ? { resolvedAt: now } : {}),
					updatedAt: now,
				};
			});

			if (!isBugReport(stored)) {
				throw new ReportNotFoundError(`Report with ID "${id}" does not exist.`);
			}

			this.host.logger.info("Bug report updated", {
				id,
				status: stored.status,
				severity: stored.severity,
			});

			return stored;
		});
	}

	async deleteReport(id: string, userId?: string, isAdmin?: boolean): Promise<void> {
		await this.serialize(async () => {
			await this.ensureMigrated();
			const report = await this.readReport(id);

			if (!report) {
				throw new ReportNotFoundError(`Report with ID "${id}" was not found.`);
			}

			if (!isAdmin && report.reportedBy.userId !== userId) {
				throw new ReportPermissionError("You do not have permission to delete this report.");
			}

			await this.host.storage.delete(this.reportKey(id));
			await this.host.storage.update(INDEX_KEY, (current) => removeIds(current, [id]));
		});

		this.host.logger.info("Bug report deleted", { id, deletedBy: userId, isAdmin });
	}

	async getSummary(): Promise<ReportsSummary> {
		const all = await this.getAllReports();

		const summary: ReportsSummary = {
			total: all.length,
			open: 0,
			inProgress: 0,
			resolved: 0,
			closed: 0,
			rejected: 0,
			byCategory: {
				playback: 0,
				metadata: 0,
				subtitles: 0,
				ui: 0,
				performance: 0,
				general: 0,
				other: 0,
			},
			bySeverity: {
				low: 0,
				medium: 0,
				high: 0,
				critical: 0,
			},
		};

		for (const r of all) {
			if (r.status === "open") summary.open++;
			else if (r.status === "in_progress") summary.inProgress++;
			else if (r.status === "resolved") summary.resolved++;
			else if (r.status === "closed") summary.closed++;
			else summary.rejected++;

			if (r.category in summary.byCategory) {
				const current = summary.byCategory[r.category] ?? 0;
				summary.byCategory[r.category] = current + 1;
			} else {
				summary.byCategory[r.category] = 1;
			}

			if (r.severity in summary.bySeverity) {
				const current = summary.bySeverity[r.severity] ?? 0;
				summary.bySeverity[r.severity] = current + 1;
			}
		}

		return summary;
	}

	async cleanupOldReports(): Promise<number> {
		if (this.config.retentionDays <= 0) return 0;

		const cutoffTime = Date.now() - this.config.retentionDays * 24 * 60 * 60 * 1000;
		const removedIds = await this.serialize(async () => {
			await this.ensureMigrated();
			const expired = (await this.getAllReports())
				.filter(
					(r) =>
						(r.status === "closed" || r.status === "rejected" || r.status === "resolved") && new Date(r.updatedAt).getTime() < cutoffTime,
				)
				.map((r) => r.id);

			for (const id of expired) await this.host.storage.delete(this.reportKey(id));
			if (expired.length > 0) await this.host.storage.update(INDEX_KEY, (current) => removeIds(current, expired));

			return expired;
		});

		if (removedIds.length > 0) {
			this.host.logger.info(`Cleaned up ${removedIds.length} expired bug reports.`);
		}

		return removedIds.length;
	}

	private async serialize<T>(operation: () => Promise<T>): Promise<T> {
		const previous = this.writeQueue;
		const finished = Promise.withResolvers<void>();
		this.writeQueue = finished.promise;
		try {
			await previous;

			return await operation();
		} finally {
			finished.resolve();
		}
	}

	private reportKey(id: string): string {
		return `${REPORT_KEY_PREFIX}${id}`;
	}

	private async readReport(id: string): Promise<BugReport | undefined> {
		const stored = await this.host.storage.get(this.reportKey(id));

		return isBugReport(stored) ? stored : undefined;
	}

	private async readReports(ids: readonly string[]): Promise<BugReport[]> {
		const reports: BugReport[] = [];
		for (let start = 0; start < ids.length; start += READ_BATCH_SIZE) {
			const batch = await Promise.all(ids.slice(start, start + READ_BATCH_SIZE).map((id) => this.readReport(id)));
			for (const report of batch) {
				if (report) reports.push(report);
			}
		}

		return reports;
	}

	private async readIndex(): Promise<string[]> {
		await this.ensureMigrated();
		const stored = await this.host.storage.get(INDEX_KEY);

		return isStringArray(stored) ? stored : [];
	}

	/** Moves reports kept by earlier versions into per-report keys once. Every caller shares that run, so no write can interleave with it. */
	private ensureMigrated(): Promise<void> {
		this.migration ??= this.migrateLegacyList();

		return this.migration;
	}

	/** Each step can run again, so an interrupted move is safe. A failed run is retried by the next caller. */
	private async migrateLegacyList(): Promise<void> {
		try {
			const legacy = await this.host.storage.get(LEGACY_LIST_KEY);
			if (!isBugReportArray(legacy)) return;

			for (const report of legacy) await this.host.storage.set(this.reportKey(report.id), report);
			const legacyIds = legacy.map((report) => report.id);
			await this.host.storage.update(INDEX_KEY, (current) => mergeIds(current, legacyIds));
			await this.host.storage.delete(LEGACY_LIST_KEY);
		} catch (error) {
			this.migration = undefined;
			throw error;
		}
	}
}

function isBugReport(value: unknown): value is BugReport {
	return typeof value === "object" && value !== null && "id" in value && typeof value.id === "string";
}

function isBugReportArray(value: unknown): value is BugReport[] {
	return Array.isArray(value) && value.every((item) => isBugReport(item));
}

function isStringArray(value: unknown): value is string[] {
	return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function appendId(current: unknown, id: string): string[] {
	const ids = isStringArray(current) ? current : [];

	return ids.includes(id) ? ids : [...ids, id];
}

function mergeIds(current: unknown, added: readonly string[]): string[] {
	return [...new Set([...(isStringArray(current) ? current : []), ...added])];
}

function removeIds(current: unknown, removed: readonly string[]): string[] {
	const drop = new Set(removed);

	return (isStringArray(current) ? current : []).filter((id) => !drop.has(id));
}
