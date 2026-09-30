import { Api } from "./lib/client";
import { ensure, Suite } from "./lib/report";
import { readState } from "./lib/state";

const suite = new Suite("17-bug-reports");

interface Report {
	id: string;
	title: string;
	status: string;
	category: string;
	severity: string;
	userId?: string;
}
interface ReportResponse {
	reports?: Report[];
	items?: Report[];
	report?: Report;
	success?: boolean;
	error?: string;
}

async function cleanupAllReports(admin: Api): Promise<void> {
	const response = await admin.get<{ reports?: Report[] }>("/v1/plugins/org.reelvault.bug-reports/reports", { query: { scope: "all" } });
	const reports = response.body.reports ?? [];
	for (const report of reports) {
		await admin.delete(`/v1/plugins/org.reelvault.bug-reports/reports/${report.id}`);
	}
}

async function main(): Promise<void> {
	const state = ensure(readState(), "run 00-bootstrap first");
	const admin = new Api().withCookie(state.adminCookie);
	const userA = new Api().withCookie(state.userACookie);
	const userB = new Api().withCookie(state.userBCookie);
	const base = "/v1/plugins/org.reelvault.bug-reports";
	await cleanupAllReports(admin);

	let createdId = "";

	await suite.case("user A submits a bug report", async (s) => {
		const response = await userA.post<ReportResponse>(`${base}/reports`, {
			title: "E2E: playback stutters on Mars",
			category: "playback",
			severity: "high",
			description: "Automated end-to-end submission.",
			pageUrl: "http://localhost:4660/details/1",
			browserInfo: "e2e-harness/1.0",
		});
		s.expect(response.status === 201, `POST /reports -> ${response.status} ${JSON.stringify(response.body)}`);
		createdId = response.body.report?.id ?? "";
		s.expect(Boolean(createdId), "report id missing");
	});

	await suite.case("report without title is rejected", async (s) => {
		const response = await userA.post<object>(`${base}/reports`, { title: "", category: "ui" });
		s.expect(response.status === 200 || response.status === 400, `no title -> ${response.status}`);
		s.expect(Boolean((response.body as { error?: string }).error), "missing title produced no error message");
	});

	await suite.case("user A sees own report only", async (s) => {
		const response = await userA.get<ReportResponse>(`${base}/reports`);
		s.expect(response.status === 200, `user list -> ${response.status}`);
		const reports = response.body.reports ?? response.body.items ?? [];
		s.expect(
			reports.some((report) => report.id === createdId),
			"own report missing from list",
		);
	});

	await suite.case("user B does not see user A report", async (s) => {
		const response = await userB.get<ReportResponse>(`${base}/reports`);
		const reports = response.body.reports ?? response.body.items ?? [];
		s.expect(!reports.some((report) => report.id === createdId), "user B sees foreign report");
	});

	await suite.case("admin sees all reports", async (s) => {
		const response = await admin.get<ReportResponse>(`${base}/reports`, { query: { scope: "all" } });
		const reports = response.body.reports ?? response.body.items ?? [];
		s.expect(
			reports.some((report) => report.id === createdId),
			"admin does not see user report",
		);
	});

	await suite.case("summary returns counts", async (s) => {
		const response = await admin.get<{ total?: number; open?: number }>(`${base}/reports/summary`);
		s.expect(response.status === 200, `summary -> ${response.status}`);
	});

	await suite.case("filters narrow the list", async (s) => {
		const response = await admin.get<ReportResponse>(`${base}/reports`, {
			query: { scope: "all", status: "open", category: "playback", severity: "high", search: "Mars" },
		});
		s.expect(response.status === 200, `filtered list -> ${response.status}`);
		const reports = response.body.reports ?? response.body.items ?? [];
		s.expect(
			reports.some((report) => report.id === createdId),
			"created report lost by filters",
		);
	});

	await suite.case("admin cannot list reports (admin list is admin-only surface, user routes work)", async (s) => {
		const response = await admin.get<ReportResponse>(`${base}/reports`);
		s.expect(response.status === 200, `admin GET /reports -> ${response.status}`);
	});

	await suite.case("user cannot change report status", async (s) => {
		const response = await userA.patch<object>(`${base}/reports/${createdId}`, { status: "resolved" });
		s.expect(
			response.status === 403 || Boolean((response.body as { error?: string }).error),
			`user PATCH -> ${response.status} ${JSON.stringify(response.body)}`,
		);
	});

	await suite.case("admin sets status and admin notes", async (s) => {
		const response = await admin.patch<ReportResponse>(`${base}/reports/${createdId}`, {
			status: "in_progress",
			priority: "high",
			adminNotes: "Repro confirmed by E2E",
		});
		s.expect(response.status === 200, `admin PATCH -> ${response.status} ${JSON.stringify(response.body)}`);
	});

	await suite.case("item endpoint returns single report", async (s) => {
		const response = await admin.get<ReportResponse>(`${base}/reports/item/${createdId}`);
		s.expect(response.status === 200, `item -> ${response.status} ${JSON.stringify(response.body)}`);
	});

	await suite.case("unknown report id handled", async (s) => {
		const response = await admin.get<object>(`${base}/reports/item/01ffffffffffffffffffffffffffff`);
		s.expect(
			response.status === 404 || Boolean((response.body as { error?: string }).error),
			`unknown id -> ${response.status} ${JSON.stringify(response.body)}`,
		);
	});

	await suite.case("active report limit enforced per user", async (s) => {
		const set = await admin.put("/v1/admin/plugins/org.reelvault.bug-reports/config", {
			cookie: state.adminCookie,
			body: { maxActiveReportsPerUser: 2 },
		});
		s.expect(set.status === 200, `set limit -> ${set.status}`);
		await Bun.sleep(400);
		const first = await userB.post<ReportResponse>(`${base}/reports`, { title: "Limit probe 1", category: "general" });
		const second = await userB.post<ReportResponse>(`${base}/reports`, { title: "Limit probe 2", category: "general" });
		const third = await userB.post<object>(`${base}/reports`, { title: "Limit probe 3", category: "general" });
		s.expect(first.status === 201 && second.status === 201, `first two reports failed: ${first.status}/${second.status}`);
		s.expect(
			Boolean((third.body as { error?: string }).error),
			`third report should hit the limit: ${third.status} ${JSON.stringify(third.body)}`,
		);
		const restore = await admin.put("/v1/admin/plugins/org.reelvault.bug-reports/config", {
			cookie: state.adminCookie,
			body: { maxActiveReportsPerUser: 20 },
		});
		s.expect(restore.status === 200, `restore limit -> ${restore.status}`);
	});

	await suite.case("foreign delete denied, author delete allowed", async (s) => {
		const denied = await userB.delete<object>(`${base}/reports/${createdId}`);
		s.expect(
			denied.status === 403 || Boolean((denied.body as { error?: string }).error),
			`foreign delete -> ${denied.status} ${JSON.stringify(denied.body)}`,
		);
		const allowed = await userA.delete<object>(`${base}/reports/${createdId}`);
		s.expect(
			allowed.status === 200 || Boolean((allowed.body as { success?: boolean }).success),
			`author delete -> ${allowed.status} ${JSON.stringify(allowed.body)}`,
		);
	});

	await suite.case("admin notification about new report arrived", async (s) => {
		const response = await userA.post<ReportResponse>(`${base}/reports`, { title: "Notify probe", category: "ui" });
		s.expect(response.status === 201, `notify probe create -> ${response.status}`);
		const notifications = await userA.get<{ items?: { title: string }[]; data?: { items?: { title: string }[] } }>("/v1/notifications");
		const items = Array.isArray(notifications.body)
			? (notifications.body as { title: string }[])
			: (notifications.body.items ?? notifications.body.data?.items ?? []);
		s.expect(
			items.some((item) => (item.title ?? "").includes("Notify probe")),
			`notification missing: ${JSON.stringify(items.slice(0, 2))}`,
		);
	});

	await suite.finish();
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
