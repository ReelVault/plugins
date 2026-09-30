import { existsSync, renameSync, rmSync } from "node:fs";
import { join } from "node:path";
import { Api, expectWait } from "./lib/client";
import { generateClip } from "./lib/media";
import { ensure, Suite } from "./lib/report";
import { MOVIES_DIR, readState, STAGING_DIR } from "./lib/state";

const suite = new Suite("12-media-requests");

interface Request {
	id: string;
	title: string;
	status: string;
	mediaType: string;
	requestedBy?: { userId: string };
}
interface RequestsResponse {
	requests: Request[];
	total: number;
}
interface Details {
	title: string;
	state?: string;
	available?: boolean;
	metadataId?: string;
}
interface Discovery {
	items?: Array<{ externalId: string; title: string }>;
	unsupported?: boolean;
}

const FULFIL_TITLE = "Tears of Steel";
const FULFIL_FILE = "Tears of Steel (2012).mp4";

async function cleanupStaleRequests(admin: Api): Promise<void> {
	const response = await admin.get<RequestsResponse>("/v1/plugins/org.reelvault.requests/requests", { query: { scope: "all" } });
	const stale = response.body.requests.filter(
		(request) =>
			request.title.includes(FULFIL_TITLE) || request.title.startsWith("Bulk Filler") || request.title.startsWith("Foreign Target"),
	);
	for (const request of stale) {
		await admin.delete(`/v1/plugins/org.reelvault.requests/requests/${request.id}`);
	}
}

async function main(): Promise<void> {
	const state = ensure(readState(), "run 00-bootstrap first");
	const admin = new Api().withCookie(state.adminCookie);
	const userA = new Api().withCookie(state.userACookie);
	const userB = new Api().withCookie(state.userBCookie);
	const base = "/v1/plugins/org.reelvault.requests";
	await cleanupStaleRequests(admin);

	await suite.case("providers endpoint lists discovery-capable provider", async (s) => {
		const response = await userA.get<{ providers?: Array<{ id: string }> }>(`${base}/providers`);
		s.expect(response.status === 200, `GET /providers -> ${response.status}`);
		s.expect(
			(response.body.providers ?? []).some((provider) => provider.id === "tmdb"),
			"tmdb not offered to media-requests",
		);
	});

	await suite.case("discover trending returns items", async (s) => {
		const response = await userA.get<Discovery>(`${base}/discover`, { query: { category: "trending", mediaType: "movie" } });
		s.expect(response.status === 200, `discover -> ${response.status} ${JSON.stringify(response.body)}`);
		s.expect((response.body.items ?? []).length > 0, "trending empty");
	});

	await suite.case("discover recommendations with externalId works (owned pair)", async (s) => {
		const response = await userA.get<Discovery>(`${base}/discover`, {
			query: { category: "recommendations", mediaType: "movie", providerId: "tmdb", externalId: "603", page: 1 },
		});
		s.expect(response.status === 200, `discover rec -> ${response.status} ${JSON.stringify(response.body).slice(0, 150)}`);
		s.expect(response.body.unsupported === false || response.body.unsupported === undefined, "recommendations marked unsupported");
		s.expect((response.body.items ?? []).length > 0, "recommendations empty for The Matrix");
	});

	await suite.case("discover invalid category -> 400", async (s) => {
		const response = await userA.get<object>(`${base}/discover`, { query: { category: "hacked" } });
		s.expect(response.status === 400, `expected 400, got ${response.status}`);
	});

	await suite.case("search movies and series", async (s) => {
		const movie = await userA.get<Discovery>(`${base}/search`, { query: { query: "Inception", mediaType: "movie" } });
		s.expect(movie.status === 200, `search -> ${movie.status}`);
		s.expect(
			(movie.body.items ?? []).some((item) => item.title.toLowerCase().includes("inception")),
			"Inception missing in search",
		);
		const empty = await userA.get<Discovery>(`${base}/search`, { query: { query: "   " } });
		s.expect(empty.status === 200 && (empty.body.items ?? []).length === 0, "whitespace query should return empty list");
	});

	await suite.case("genres and genre tiles", async (s) => {
		const genres = await userA.get<{ genres?: Array<{ id: string; name: string }> }>(`${base}/genres`, { query: { mediaType: "movie" } });
		s.expect(genres.status === 200 && (genres.body.genres ?? []).length > 0, `genres -> ${genres.status}`);
		const tiles = await userA.get<{ tiles?: unknown[] }>(`${base}/genre-tiles`, { query: { mediaType: "movie" } });
		s.expect(tiles.status === 200, `genre-tiles -> ${tiles.status}`);
		s.expect((tiles.body.tiles ?? []).length > 0, "genre tiles empty");
	});

	await suite.case("details for library title shows available", async (s) => {
		const search = await userA.get<Discovery>(`${base}/search`, { query: { query: "Sintel", mediaType: "movie" } });
		const externalId = (search.body.items ?? []).find(
			(item) => item.title.toLowerCase().includes("sintel") && !item.externalId.startsWith("tt"),
		)?.externalId;
		s.expect(Boolean(externalId), "Sintel external id missing");
		const details = await userA.get<Details>(`${base}/details`, { query: { providerId: "tmdb", externalId, mediaType: "movie" } });
		s.expect(details.status === 200, `details -> ${details.status}`);
		s.expect(details.body.state === "available", `Sintel in library should be available, got state=${details.body.state}`);
		s.expect(Boolean(details.body.metadataId), "available details should carry metadataId");
	});

	await suite.case("missing details params -> 400", async (s) => {
		const response = await userA.get<object>(`${base}/details`, { query: {} });
		s.expect(response.status === 400, `expected 400, got ${response.status}`);
	});

	await suite.case("seasons endpoint returns episodes", async (s) => {
		const search = await userA.get<Discovery>(`${base}/search`, { query: { query: "Friends", mediaType: "tv_show" } });
		const externalId = (search.body.items ?? []).find(
			(item) => item.title.toLowerCase().includes("friends") && !item.externalId.startsWith("tt"),
		)?.externalId;
		s.expect(Boolean(externalId), "Friends external id missing");
		const season = await userA.get<{ episodes?: unknown[] }>(`${base}/seasons`, {
			query: { providerId: "tmdb", externalId, seasonNumber: 1 },
		});
		s.expect(season.status === 200, `seasons -> ${season.status}`);
		s.expect((season.body.episodes ?? []).length > 0, "season 1 has no episodes");
	});

	await suite.case("user A submits a request", async (s) => {
		const response = await userA.post<{ success?: boolean; request?: Request }>(`${base}/requests`, {
			title: FULFIL_TITLE,
			mediaType: "movie",
			providerId: "tmdb",
			externalId: "133695",
			year: 2012,
		});
		s.expect(response.status === 201, `POST /requests -> ${response.status} ${JSON.stringify(response.body)}`);
		s.expect(response.body.success === true, `creation failed: ${JSON.stringify(response.body)}`);
	});

	await suite.case("non-admin cannot use scope=all", async (s) => {
		const probe = await userA.post<{ request?: Request }>(`${base}/requests`, {
			title: `Self Scope Probe ${(Math.random() + 1).toString(36).slice(2, 7)}`,
			mediaType: "movie",
		});
		s.expect(
			probe.status === 201 && Boolean(probe.body.request?.requestedBy?.userId),
			`probe create -> ${probe.status} ${JSON.stringify(probe.body)}`,
		);
		const selfId = probe.body.request?.requestedBy?.userId ?? "";
		const response = await userA.get<RequestsResponse>(`${base}/requests`, { query: { scope: "all" } });
		s.expect(response.status === 200, `scope=all -> ${response.status}`);
		const own = response.body.requests.every((request) => request.requestedBy?.userId === selfId);
		s.expect(own, "user A can see foreign requests with scope=all");
		await userA.delete(`${base}/requests/${probe.body.request?.id}`);
	});

	await suite.case("admin sees all requests with scope=all", async (s) => {
		const response = await admin.get<RequestsResponse>(`${base}/requests`, { query: { scope: "all" } });
		s.expect(response.status === 200, `admin scope=all -> ${response.status}`);
		s.expect(response.body.requests.length > 0, "admin sees no requests");
	});

	await suite.case("summary endpoint reflects counts", async (s) => {
		const response = await admin.get<{ total?: number }>(`${base}/requests/summary`);
		s.expect(response.status === 200, `summary -> ${response.status}`);
		s.expect((response.body.total ?? 0) >= 1, "summary total below expected");
	});

	await suite.case("invalid request body is rejected", async (s) => {
		const response = await userA.post<{ error?: string }>(`${base}/requests`, { title: "", mediaType: "cartoon" });
		s.expect(Boolean(response.body.error), `invalid body -> ${response.status} ${JSON.stringify(response.body)}`);
	});

	await suite.case("admin approves the request", async (s) => {
		const requestId = await findRequestId(admin, FULFIL_TITLE);
		s.expect(Boolean(requestId), "request not found for admin");
		const response = await admin.patch<{ success?: boolean; request?: Request }>(`${base}/requests/${requestId}`, { status: "approved" });
		s.expect(response.status === 200, `PATCH -> ${response.status} ${JSON.stringify(response.body)}`);
		s.expect(response.body.request?.status === "approved", `status after patch: ${JSON.stringify(response.body)}`);
	});

	await suite.case("admin cannot set unknown status", async (s) => {
		const requestId = await findRequestId(admin, FULFIL_TITLE);
		const response = await admin.patch<{ error?: string; success?: boolean; request?: Request }>(`${base}/requests/${requestId}`, {
			status: "grant-wishes",
		});
		s.expect(Boolean(response.body.error), "invalid status accepted without error");
	});

	await suite.case("coming-soon lists approved request", async (s) => {
		const response = await userA.get<{ items?: Array<{ title: string }> }>(`${base}/coming-soon`);
		s.expect(response.status === 200, `coming-soon -> ${response.status}`);
		s.expect(
			(response.body.items ?? []).some((item) => item.title.includes(FULFIL_TITLE)),
			"approved request missing from coming-soon",
		);
	});

	await suite.case("auto-fulfillment: new library file fulfils the request", async (s) => {
		const target = join(MOVIES_DIR, FULFIL_FILE);
		const staged = join(STAGING_DIR, FULFIL_FILE);
		if (existsSync(target)) {
			rmSync(target);
			await admin.post(`/v1/libraries/${state.moviesLibraryId}/scan`, {});
			await Bun.sleep(3_000);
		}
		await generateClip(suite, staged, 20);
		renameSync(staged, target);
		const scan = await admin.post(`/v1/libraries/${state.moviesLibraryId}/scan`, {});
		s.expect(scan.status === 202 || scan.status === 200 || scan.status === 409, `scan -> ${scan.status}`);
		const fulfilled = await expectWait(
			async () => {
				const response = await admin.get<RequestsResponse>(`${base}/requests`, { query: { scope: "all" } });
				return response.body.requests.find((request) => request.title.includes(FULFIL_TITLE) && request.status === "available") ?? null;
			},
			"request auto-fulfilled",
			150_000,
			3_000,
		);
		s.expect(Boolean(fulfilled), "request never became available after scan");
	});

	await suite.case("available request produces user notification", async (s) => {
		const notification = await expectWait(
			async () => {
				const response = await userA.get<{ items?: Array<{ title?: string; message?: string }> }>("/v1/notifications");
				const items = Array.isArray(response.body) ? response.body : (response.body.items ?? []);
				return items.find((item) => `${item.title ?? ""} ${item.message ?? ""}`.toLowerCase().includes(FULFIL_TITLE.toLowerCase())) ?? null;
			},
			"availability notification",
			60_000,
			2_000,
		);
		s.expect(Boolean(notification), "no notification about available title");
	});

	await suite.case("request limit per user is enforced", async (s) => {
		for (let index = 0; index < 10; index += 1) {
			const response = await userB.post<{ error?: string }>(`${base}/requests`, {
				title: `Bulk Filler ${index} ${(Math.random() + 1).toString(36).slice(2, 7)}`,
				mediaType: "movie",
			});
			s.expect(
				response.status === 201 || Boolean(response.body.error),
				`bulk create ${index} -> ${response.status} ${JSON.stringify(response.body)}`,
			);
			if (response.status === 201) continue;
			break;
		}
		const overflow = await userB.post<{ error?: string }>(`${base}/requests`, { title: "One Too Many", mediaType: "movie" });
		s.expect(Boolean(overflow.body.error), `overflow accepted: ${overflow.status} ${JSON.stringify(overflow.body)}`);
		if (overflow.body.error)
			s.expect(overflow.body.error.toLowerCase().includes("limit"), `limit error not descriptive: ${overflow.body.error}`);
	});

	await suite.case("author can delete own request", async (s) => {
		const requestId = await findRequestId(userB, "Bulk Filler 0");
		s.expect(Boolean(requestId), "user B request not found");
		const response = await userB.delete<{ success?: boolean }>(`${base}/requests/${requestId}`);
		s.expect(
			response.status === 200 && response.body.success === true,
			`delete own -> ${response.status} ${JSON.stringify(response.body)}`,
		);
	});

	await suite.case("user cannot delete foreign request", async (s) => {
		const created = await userB.post<{ request?: Request }>(`${base}/requests`, { title: "Foreign Target Probe", mediaType: "movie" });
		s.expect(
			created.status === 201 && Boolean(created.body.request?.id),
			`foreign target create -> ${created.status} ${JSON.stringify(created.body)}`,
		);
		const foreignId = created.body.request?.id ?? "";
		const response = await userA.delete<{ error?: string }>(`${base}/requests/${foreignId}`);
		s.expect(
			response.status === 403 || Boolean(response.body.error),
			`foreign delete -> ${response.status} ${JSON.stringify(response.body)}`,
		);
		await userB.delete(`${base}/requests/${foreignId}`);
	});

	await suite.finish();
}

async function _resolveUserId(api: Api): Promise<string> {
	const session = await api.get<Array<{ user?: { id: string } }>>("/v1/auth/sessions");
	return session.body[0]?.user?.id ?? "unknown";
}

async function findRequestId(api: Api, title: string): Promise<string | null> {
	const response = await api.get<RequestsResponse>("/v1/plugins/org.reelvault.requests/requests", { query: { scope: "all" } });
	return response.body.requests.find((request) => request.title.includes(title))?.id ?? null;
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
