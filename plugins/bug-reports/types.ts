export type BugReportCategory = "playback" | "metadata" | "subtitles" | "ui" | "performance" | "general" | "other";

export type BugReportSeverity = "low" | "medium" | "high" | "critical";

export type BugReportStatus = "open" | "in_progress" | "resolved" | "closed" | "rejected";

export interface BugReportDeviceInfo {
	browser?: string;
	os?: string;
	screenResolution?: string;
	language?: string;
	userAgent?: string;
}

export interface BugReportUser {
	userId: string;
	profileId?: string;
	role?: string;
}

export interface BugReport {
	id: string;
	title: string;
	description: string;
	category: BugReportCategory;
	severity: BugReportSeverity;
	status: BugReportStatus;
	pageUrl?: string;
	mediaId?: string;
	mediaTitle?: string;
	deviceInfo?: BugReportDeviceInfo;
	logs?: string;
	reportedBy: BugReportUser;
	adminNotes?: string;
	createdAt: string;
	updatedAt: string;
	resolvedAt?: string;
}

export interface CreateBugReportInput {
	title: string;
	description?: string;
	category?: BugReportCategory;
	severity?: BugReportSeverity;
	pageUrl?: string;
	mediaId?: string;
	mediaTitle?: string;
	deviceInfo?: BugReportDeviceInfo;
	logs?: string;
}

export interface UpdateBugReportInput {
	status?: BugReportStatus;
	severity?: BugReportSeverity;
	adminNotes?: string;
}

export interface ReportsSummary {
	total: number;
	open: number;
	inProgress: number;
	resolved: number;
	closed: number;
	rejected: number;
	byCategory: Record<string, number>;
	bySeverity: Record<string, number>;
}
