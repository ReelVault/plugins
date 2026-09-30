import { Api } from "./lib/client";
import { ensure, Suite } from "./lib/report";
import { readState } from "./lib/state";

const suite = new Suite("15-trailers");

interface TrailerResponse {
	found?: boolean;
	trailerKey?: string;
	error?: string;
	message?: string;
}

async function main(): Promise<void> {
	const state = ensure(readState(), "run 00-bootstrap first");
	const admin = new Api().withCookie(state.adminCookie);
	const userA = new Api().withCookie(state.userACookie);
	const base = "/v1/plugins/org.reelvault.trailers";
	const metadataId = state.movies[0]?.metadataId;

	await suite.case("trailer by metadataId found", async (s) => {
		s.expect(Boolean(metadataId), "no metadataId in state");
		const response = await userA.get<TrailerResponse>(`${base}/trailer`, { metadataId });
		s.expect(response.status === 200, `trailer -> ${response.status} ${JSON.stringify(response.body)}`);
		s.expect(response.body.found === true, `trailer not found: ${JSON.stringify(response.body)}`);
		s.expect(Boolean(response.body.trailerKey), "trailerKey missing");
	});

	await suite.case("trailer by tmdbId+year", async (s) => {
		const response = await userA.get<TrailerResponse>(`${base}/trailer`, { tmdbId: "45745", mediaType: "movie" });
		s.expect(response.status === 200, `trailer -> ${response.status}`);
		s.expect(response.body.found === true && Boolean(response.body.trailerKey), `trailer by tmdbId: ${JSON.stringify(response.body)}`);
	});

	await suite.case("trailer by title for a series", async (s) => {
		const response = await userA.get<TrailerResponse>(`${base}/trailer`, { title: "Friends", mediaType: "tv_show" });
		s.expect(response.status === 200, `trailer -> ${response.status}`);
		s.expect(response.body.found === true || Boolean(response.body.message), `series trailer: ${JSON.stringify(response.body)}`);
	});

	await suite.case("no params yields error message without crash", async (s) => {
		const response = await userA.get<object>(`${base}/trailer`);
		s.expect(response.status === 200 || response.status === 400, `trailer no params -> ${response.status}`);
	});

	await suite.case("trailer for garbage title not found but handled", async (s) => {
		const response = await userA.get<TrailerResponse>(`${base}/trailer`, { title: "xkcd-nonexistent-title-9271", mediaType: "movie" });
		s.expect(response.status === 200, `garbage title -> ${response.status}`);
		s.expect(response.body.found === false || Boolean(response.body.message), `garbage title body: ${JSON.stringify(response.body)}`);
	});

	await suite.case("stats endpoint works", async (s) => {
		const response = await admin.get<{ cached?: number; entries?: number }>(`${base}/stats`);
		s.expect(response.status === 200, `stats -> ${response.status}`);
	});

	await suite.case("cache-all is admin-only", async (s) => {
		const denied = await userA.post<object>(`${base}/cache-all`);
		s.expect(denied.status === 403, `user cache-all -> ${denied.status}`);
		const adminRun = await admin.post<object>(`${base}/cache-all`);
		s.expect(adminRun.status === 200, `admin cache-all -> ${adminRun.status} ${JSON.stringify(adminRun.body)}`);
	});

	await suite.finish();
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
