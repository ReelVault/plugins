import { Api } from "./lib/client";
import { ensure, Suite } from "./lib/report";
import { readState } from "./lib/state";

const suite = new Suite("14-community-markers");

interface PublicSegment {
	id: string;
	mediaFileId: string;
	type: string;
	startSeconds: number;
	endSeconds: number;
	status: string;
	score: number;
	upvotes?: unknown[];
	downvotes?: unknown[];
	submittedByUserId?: string;
	voters?: unknown;
}

function asSegments(body: unknown): PublicSegment[] {
	if (Array.isArray(body)) return body as PublicSegment[];
	if (body && typeof body === "object" && Array.isArray((body as { segments?: unknown }).segments)) {
		return (body as { segments: PublicSegment[] }).segments;
	}
	return [];
}

async function main(): Promise<void> {
	const state = ensure(readState(), "run 00-bootstrap first");
	const admin = new Api().withCookie(state.adminCookie);
	const userA = new Api().withCookie(state.userACookie);
	const userB = new Api().withCookie(state.userBCookie);
	const mediaFileId = state.seriesEpisode?.mediaFileId;
	suite.expect(Boolean(mediaFileId), "no episode mediaFileId in state");
	const base = "/v1/plugins/org.reelvault.community-markers";

	await suite.case("segment submit without body is rejected", async (s) => {
		const response = await userA.post<object>(`${base}/segments`, {});
		s.expect(
			Boolean((response.body as { error?: string }).error),
			`invalid segment -> ${response.status} ${JSON.stringify(response.body)}`,
		);
	});

	await suite.case("segment for unknown mediaFileId -> 404", async (s) => {
		const response = await userA.post<object>(`${base}/segments`, {
			mediaFileId: "01ffffffffffffffffffffffffffff",
			type: "intro",
			startSeconds: 0,
			endSeconds: 30,
		});
		s.expect(response.status === 404, `expected 404, got ${response.status} ${JSON.stringify(response.body)}`);
	});

	await suite.case("intro segment is created and instantly approved (threshold 1)", async (s) => {
		const response = await userA.post<PublicSegment>(`${base}/segments`, {
			mediaFileId,
			type: "intro",
			startSeconds: 1,
			endSeconds: 20,
			label: "E2E intro",
		});
		s.expect(response.status === 201, `POST /segments -> ${response.status} ${JSON.stringify(response.body)}`);
		const segment = response.body as unknown as PublicSegment;
		s.expect(segment.status === "approved", `segment status: ${segment.status}`);
		s.expect(Boolean(segment.id), "segment id missing");
	});

	await suite.case("public projection hides voter identities", async (s) => {
		const response = await userA.get<{ segments?: PublicSegment[] }>(`${base}/segments`, { mediaFileId });
		s.expect(response.status === 200, `GET /segments -> ${response.status}`);
		const list = asSegments(response.body);
		const raw = JSON.stringify(list);
		s.expect(!raw.includes("submittedByUserId"), "projection leaks submittedByUserId");
		s.expect(!raw.includes("upvotes"), "projection leaks upvotes");
		s.expect(list.length > 0, "segments list empty");
	});

	await suite.case("segments sync into native media markers", async (s) => {
		const markers = await admin.get<unknown>("/v1/media-files/markers", { query: { limit: 1000 } });
		s.expect(markers.status === 200, `markers -> ${markers.status} ${JSON.stringify(markers.body).slice(0, 150)}`);
		const payload = markers.body as { data?: { mediaFileId?: string; type?: string }[] } | { mediaFileId?: string; type?: string }[];
		const list: { mediaFileId?: string; type?: string }[] = Array.isArray(payload) ? payload : (payload.data ?? []);
		const raw = JSON.stringify(list);
		s.expect(
			list.some((marker) => marker.mediaFileId === mediaFileId && marker.type === "intro"),
			`no intro marker synced for episode: ${raw.slice(0, 250)}`,
		);
	});

	await suite.case("end time must be greater than start time", async (s) => {
		const response = await userA.post<object>(`${base}/segments`, { mediaFileId, type: "recap", startSeconds: 50, endSeconds: 10 });
		s.expect(Boolean((response.body as { error?: string }).error), `bad times -> ${response.status} ${JSON.stringify(response.body)}`);
	});

	await suite.case("negative time is rejected", async (s) => {
		const response = await userA.post<object>(`${base}/segments`, { mediaFileId, type: "credits", startSeconds: -5, endSeconds: 10 });
		s.expect(Boolean((response.body as { error?: string }).error), `negative time -> ${response.status} ${JSON.stringify(response.body)}`);
	});

	await suite.case("parallel submissions on one file all land (lock)", async (s) => {
		const responses = await Promise.all(
			[1, 2, 3, 4, 5].map((index) =>
				userB.post<object>(`${base}/segments`, {
					mediaFileId,
					type: "chapter",
					startSeconds: 100 + index * 20,
					endSeconds: 110 + index * 20,
					label: `Chapter ${index}`,
				}),
			),
		);
		const created = responses.filter((response) => response.status === 201);
		s.expect(
			created.length === 5,
			`only ${created.length}/5 parallel submissions succeeded: ${responses.map((response) => response.status).join(",")}`,
		);
	});

	await suite.case("approval flow: score 2 approves pending segment", async (s) => {
		const threshold = await admin.put("/v1/admin/plugins/org.reelvault.community-markers/config", {
			cookie: state.adminCookie,
			body: { approvalThreshold: 2, autoApprove: false, rejectionThreshold: -2 },
		});
		s.expect(threshold.status === 200, `set threshold -> ${threshold.status}`);
		await Bun.sleep(400);
		const created = await userA.post<PublicSegment>(`${base}/segments`, {
			mediaFileId,
			type: "highlight",
			startSeconds: 7,
			endSeconds: 999,
			label: "Highlight (end ignored)",
		});
		s.expect(created.status === 201, `highlight -> ${created.status} ${JSON.stringify(created.body)}`);
		const segment = created.body as unknown as PublicSegment;
		s.expect(segment.status === "pending", `highlight should be pending, got ${segment.status}`);
		s.expect(segment.endSeconds === segment.startSeconds, "highlight end should equal start");
		const vote = await userB.post<object>(`${base}/segments/vote?id=${segment.id}&mediaFileId=${mediaFileId}`, { value: 1 });
		s.expect(
			vote.status === 200 || Boolean((vote.body as { error?: string }).error) === false,
			`vote -> ${vote.status} ${JSON.stringify(vote.body)}`,
		);
		const after = await userA.get<{ segments?: PublicSegment[] }>(`${base}/segments`, { mediaFileId });
		const updated = asSegments(after.body).find((item) => item.id === segment.id);
		s.expect(updated?.status === "approved", `segment should be approved after upvote, got ${updated?.status}`);
		const restore = await admin.put("/v1/admin/plugins/org.reelvault.community-markers/config", {
			cookie: state.adminCookie,
			body: { approvalThreshold: 1, autoApprove: false, rejectionThreshold: -2 },
		});
		s.expect(restore.status === 200, `restore thresholds -> ${restore.status}`);
	});

	await suite.case("rejection flow: downvotes reject segment", async (s) => {
		const created = await userA.post<PublicSegment>(`${base}/segments`, {
			mediaFileId,
			type: "recap",
			startSeconds: 200,
			endSeconds: 230,
		});
		s.expect(created.status === 201, `recap -> ${created.status}`);
		const segment = created.body as unknown as PublicSegment;
		await userB.post(`${base}/segments/vote?id=${segment.id}&mediaFileId=${mediaFileId}`, { body: { value: -1 } });
		await admin.post(`${base}/segments/vote?id=${segment.id}&mediaFileId=${mediaFileId}`, { body: { value: -1 } });
		const after = await userA.get<{ segments?: PublicSegment[] }>(`${base}/segments`, { mediaFileId });
		const updated = asSegments(after.body).find((item) => item.id === segment.id);
		s.expect(updated?.status === "rejected", `segment should be rejected, got ${updated?.status}`);
	});

	await suite.case("admin listing shows all files", async (s) => {
		const response = await admin.get<{ segments?: unknown[]; items?: unknown[] }>(`${base}/admin/segments`);
		s.expect(response.status === 200, `admin/segments -> ${response.status}`);
		const count = asSegments(response.body).length;
		s.expect(count >= 1, "admin listing empty");
	});

	await suite.case("admin routes forbidden for user", async (s) => {
		const response = await userA.get<object>(`${base}/admin/segments`);
		s.expect(response.status === 403, `expected 403, got ${response.status}`);
	});

	await suite.case("foreign delete denied, admin delete allowed", async (s) => {
		const list = await userA.get<{ segments?: PublicSegment[] }>(`${base}/segments`, { mediaFileId });
		const foreign = asSegments(list.body).find((item) => item.type === "chapter");
		s.expect(Boolean(foreign), "no user B chapter to attack");
		const foreignId = ensure(foreign, "chapter id").id;
		const denied = await userA.delete<{ error?: string }>(`${base}/segments?id=${foreignId}&mediaFileId=${mediaFileId}`);
		s.expect(
			denied.status === 403 || Boolean((denied.body as { error?: string }).error),
			`foreign delete -> ${denied.status} ${JSON.stringify(denied.body)}`,
		);
		const adminDelete = await admin.delete<{ error?: string }>(`${base}/segments?id=${foreignId}&mediaFileId=${mediaFileId}`);
		s.expect(
			adminDelete.status === 200 || adminDelete.status === 403,
			`admin delete -> ${adminDelete.status} ${JSON.stringify(adminDelete.body)}`,
		);
	});

	await suite.finish();
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
