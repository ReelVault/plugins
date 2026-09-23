import type { PluginHost } from "reelvault-sdk/plugin";
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

const STORAGE_KEY_REPORTS = "bug_reports_list";

export class ReportsManager {
	private readonly host: PluginHost;
	private readonly config: BugReportsConfig;

	constructor(host: PluginHost, config: BugReportsConfig) {
		this.host = host;
		this.config = config;
	}

	async getAllReports(): Promise<BugReport[]> {
		const stored = await this.host.storage.get(STORAGE_KEY_REPORTS);
		return isBugReportArray(stored) ? stored : [];
	}

	async getReportById(id: string): Promise<BugReport | null> {
		const all = await this.getAllReports();
		return all.find((r) => r.id === id) ?? null;
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
		const all = await this.getAllReports();

		const activeReportsCount = all.filter(
			(r) => r.reportedBy.userId === user.userId && (r.status === "open" || r.status === "in_progress"),
		).length;

		if (activeReportsCount >= this.config.maxActiveReportsPerUser) {
			throw new Error(`Active report limit reached (${this.config.maxActiveReportsPerUser}). Wait for earlier reports to be resolved.`);
		}

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
			logs: input.logs,
			reportedBy: user,
			createdAt: now,
			updatedAt: now,
		};

		all.push(newReport);
		await this.host.storage.set(STORAGE_KEY_REPORTS, all);

		this.host.logger.info("New bug report created", {
			id: newReport.id,
			category: newReport.category,
			severity: newReport.severity,
			userId: user.userId,
		});

		return newReport;
	}

	async updateReport(id: string, input: UpdateBugReportInput): Promise<BugReport> {
		const all = await this.getAllReports();
		const reportIndex = all.findIndex((r) => r.id === id);

		if (reportIndex === -1) {
			throw new Error(`Report with ID "${id}" does not exist.`);
		}

		const existing = all[reportIndex];
		if (!existing) {
			throw new Error(`Report with ID "${id}" does not exist.`);
		}

		const now = new Date().toISOString();
		const updatedStatus = input.status ?? existing.status;
		const isResolving =
			(updatedStatus === "resolved" || updatedStatus === "closed") && existing.status !== "resolved" && existing.status !== "closed";

		const updatedReport: BugReport = {
			...existing,
			...(input.status ? { status: input.status } : {}),
			...(input.severity ? { severity: input.severity } : {}),
			...(input.adminNotes !== undefined ? { adminNotes: input.adminNotes } : {}),
			...(isResolving ? { resolvedAt: now } : {}),
			updatedAt: now,
		};

		all[reportIndex] = updatedReport;
		await this.host.storage.set(STORAGE_KEY_REPORTS, all);

		this.host.logger.info("Bug report updated", {
			id,
			status: updatedReport.status,
			severity: updatedReport.severity,
		});

		return updatedReport;
	}

	async deleteReport(id: string, userId?: string, isAdmin?: boolean): Promise<void> {
		const all = await this.getAllReports();
		const report = all.find((r) => r.id === id);

		if (!report) {
			throw new Error(`Report with ID "${id}" was not found.`);
		}

		if (!isAdmin && report.reportedBy.userId !== userId) {
			throw new Error("You do not have permission to delete this report.");
		}

		const filtered = all.filter((r) => r.id !== id);
		await this.host.storage.set(STORAGE_KEY_REPORTS, filtered);

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

		const all = await this.getAllReports();
		const cutoffTime = Date.now() - this.config.retentionDays * 24 * 60 * 60 * 1000;

		const toKeep = all.filter((r) => {
			if (r.status !== "closed" && r.status !== "rejected" && r.status !== "resolved") {
				return true;
			}
			const reportTime = new Date(r.updatedAt).getTime();
			return reportTime >= cutoffTime;
		});

		const removedCount = all.length - toKeep.length;
		if (removedCount > 0) {
			await this.host.storage.set(STORAGE_KEY_REPORTS, toKeep);
			this.host.logger.info(`Cleaned up ${removedCount} expired bug reports.`);
		}

		return removedCount;
	}
}

function isBugReportArray(value: unknown): value is BugReport[] {
	return Array.isArray(value);
}
