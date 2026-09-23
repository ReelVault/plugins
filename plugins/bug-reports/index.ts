import { definePlugin } from "reelvault-sdk/plugin";
import { config } from "./config";
import { ReportsManager } from "./src/reports-manager";
import type {
	BugReportCategory,
	BugReportDeviceInfo,
	BugReportSeverity,
	BugReportStatus,
	CreateBugReportInput,
	UpdateBugReportInput,
} from "./types";

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isBugReportStatus(value: unknown): value is BugReportStatus {
	return value === "open" || value === "in_progress" || value === "resolved" || value === "closed" || value === "rejected";
}

function isBugReportCategory(value: unknown): value is BugReportCategory {
	return (
		value === "playback" ||
		value === "metadata" ||
		value === "subtitles" ||
		value === "ui" ||
		value === "performance" ||
		value === "general" ||
		value === "other"
	);
}

function isBugReportSeverity(value: unknown): value is BugReportSeverity {
	return value === "low" || value === "medium" || value === "high" || value === "critical";
}

function optionalString(record: Record<string, unknown>, key: string): string | undefined {
	const value = record[key];
	return typeof value === "string" && value !== "" ? value : undefined;
}

function nonEmpty(value: string | undefined): string | undefined {
	return value === "" ? undefined : value;
}

function parseStatusFilter(value: string | undefined): BugReportStatus | "all" | undefined {
	if (value === "all") return "all";
	return isBugReportStatus(value) ? value : undefined;
}

function parseCategoryFilter(value: string | undefined): BugReportCategory | "all" | undefined {
	if (value === "all") return "all";
	return isBugReportCategory(value) ? value : undefined;
}

function parseSeverityFilter(value: string | undefined): BugReportSeverity | "all" | undefined {
	if (value === "all") return "all";
	return isBugReportSeverity(value) ? value : undefined;
}

function parseDeviceInfo(value: unknown): BugReportDeviceInfo | undefined {
	if (!isRecord(value)) return undefined;
	const info: BugReportDeviceInfo = {};
	if (typeof value.browser === "string") info.browser = value.browser;
	if (typeof value.os === "string") info.os = value.os;
	if (typeof value.screenResolution === "string") info.screenResolution = value.screenResolution;
	if (typeof value.language === "string") info.language = value.language;
	if (typeof value.userAgent === "string") info.userAgent = value.userAgent;
	return info;
}

function parseCreateBugReportInput(body: unknown): CreateBugReportInput | null {
	if (!isRecord(body)) return null;

	const title = typeof body.title === "string" ? body.title.trim() : "";
	if (!title) return null;

	const description = optionalString(body, "description");
	const category = isBugReportCategory(body.category) ? body.category : undefined;
	const severity = isBugReportSeverity(body.severity) ? body.severity : undefined;
	const pageUrl = optionalString(body, "pageUrl");
	const mediaId = optionalString(body, "mediaId");
	const mediaTitle = optionalString(body, "mediaTitle");
	const logs = optionalString(body, "logs");
	const deviceInfo = parseDeviceInfo(body.deviceInfo);

	return {
		title,
		...(description !== undefined ? { description } : {}),
		...(category !== undefined ? { category } : {}),
		...(severity !== undefined ? { severity } : {}),
		...(pageUrl !== undefined ? { pageUrl } : {}),
		...(mediaId !== undefined ? { mediaId } : {}),
		...(mediaTitle !== undefined ? { mediaTitle } : {}),
		...(logs !== undefined ? { logs } : {}),
		...(deviceInfo !== undefined ? { deviceInfo } : {}),
	};
}

function parseUpdateBugReportInput(body: unknown): UpdateBugReportInput | null {
	if (!isRecord(body)) return null;

	const update: UpdateBugReportInput = {};
	if (isBugReportStatus(body.status)) update.status = body.status;
	if (isBugReportSeverity(body.severity)) update.severity = body.severity;
	if (typeof body.adminNotes === "string") update.adminNotes = body.adminNotes;
	return update;
}

export default definePlugin(config, {
	async setup(host) {
		const manager = new ReportsManager(host, host.config);

		host.logger.info("Bug Reports plugin initialized", {
			notifyAdminsOnReport: host.config.notifyAdminsOnReport,
			maxActiveReportsPerUser: host.config.maxActiveReportsPerUser,
			retentionDays: host.config.retentionDays,
		});

		// 1. Scheduled task for periodically cleaning up old reports
		await host.tasks.register({
			id: "bug-reports-cleanup",
			name: "bug-reports-cleanup",
			description: "Deletes expired, closed and rejected bug reports according to the retention window.",
			defaultTriggers: [{ id: "bug-reports-cleanup-daily", type: "interval", intervalMinutes: 1440 }],
			run: async () => {
				const cleaned = await manager.cleanupOldReports();
				host.logger.info("Bug reports cleanup completed", { cleaned });
				return cleaned > 0 ? `Cleaned ${cleaned} bug reports` : "No bug reports needed cleanup";
			},
		});

		// 2. HTTP route: GET /reports - list reports
		await host.routes.register({
			method: "GET",
			path: "/reports",
			handler: async ({ query, user }) => {
				const status = parseStatusFilter(query.status);
				const category = parseCategoryFilter(query.category);
				const severity = parseSeverityFilter(query.severity);
				const search = nonEmpty(query.search);

				// If the user asked for their own only, or is not an admin
				const isUserScope = query.scope !== "all" || user.role !== "admin";
				const userId = isUserScope ? user.id : undefined;

				const reports = await manager.listReports({
					userId,
					status,
					category,
					severity,
					search,
				});

				return {
					body: {
						reports,
						total: reports.length,
					},
				};
			},
		});

		// 3. HTTP route: GET /reports/summary - report statistics and aggregations
		await host.routes.register({
			method: "GET",
			path: "/reports/summary",
			handler: async () => {
				const summary = await manager.getSummary();
				return {
					body: summary,
				};
			},
		});

		// 4. HTTP route: GET /reports/item/:id - fetch a single report
		await host.routes.register({
			method: "GET",
			path: "/reports/item/:id",
			handler: async ({ params, user }) => {
				const id = params.id;
				if (!id) {
					return { body: { error: "Missing report ID." } };
				}

				const report = await manager.getReportById(id);
				if (!report) {
					return { body: { error: "Report does not exist." } };
				}

				const isAdmin = user.role === "admin";
				if (!isAdmin && report.reportedBy.userId !== user.id) {
					return { body: { error: "You do not have access to this report." } };
				}

				return {
					body: {
						report,
					},
				};
			},
		});

		// 5. HTTP route: POST /reports - submit a new bug
		await host.routes.register({
			method: "POST",
			path: "/reports",
			handler: async ({ body, user }) => {
				const input = parseCreateBugReportInput(body);
				if (!input) {
					return {
						body: { error: "The 'title' field is required." },
					};
				}

				const userId = user.id;
				const profileId = user.profileId;
				const userRole = user.role;

				try {
					const report = await manager.createReport(input, {
						userId,
						profileId,
						role: userRole,
					});

					// In-app notification when enabled
					if (host.config.notifyAdminsOnReport) {
						try {
							await host.notifications.create({
								userId,
								profileId,
								type: "bug-report",
								title: `New bug report: ${report.title}`,
								message: `Kategoria: ${report.category}, Priorytet: ${report.severity}`,
								data: { reportId: report.id },
							});
						} catch {
							host.logger.warn("Could not dispatch notification for bug report", { reportId: report.id });
						}
					}

					return {
						status: 201,
						body: {
							success: true,
							report,
						},
					};
				} catch (err: unknown) {
					return {
						body: { error: err instanceof Error ? err.message : "Failed to create the report." },
					};
				}
			},
		});

		// 6. HTTP route: PATCH /reports/:id - update status and notes (admin)
		await host.routes.register({
			method: "PATCH",
			path: "/reports/:id",
			access: "admin",
			handler: async ({ params, body }) => {
				const id = params.id;
				const payload = parseUpdateBugReportInput(body);

				if (!id) {
					return { body: { error: "Missing report ID." } };
				}

				if (!payload) {
					return { body: { error: "Invalid report update data." } };
				}

				try {
					const updated = await manager.updateReport(id, payload);
					return {
						body: {
							success: true,
							report: updated,
						},
					};
				} catch (err: unknown) {
					return {
						body: { error: err instanceof Error ? err.message : "Failed to update the report." },
					};
				}
			},
		});

		// 7. HTTP route: DELETE /reports/:id - delete a report
		await host.routes.register({
			method: "DELETE",
			path: "/reports/:id",
			handler: async ({ params, user }) => {
				const id = params.id;
				if (!id) {
					return { body: { error: "Missing report ID." } };
				}

				const isAdmin = user.role === "admin";
				const userId = user.id;

				try {
					await manager.deleteReport(id, userId, isAdmin);
					return {
						body: {
							success: true,
							message: "The report was deleted.",
						},
					};
				} catch (err: unknown) {
					return {
						body: { error: err instanceof Error ? err.message : "Failed to delete the report." },
					};
				}
			},
		});
	},
});
