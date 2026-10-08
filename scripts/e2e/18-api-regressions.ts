import { Api } from "./lib/client";
import { ensure, Suite } from "./lib/report";
import { readState } from "./lib/state";

/**
 * API contract regressions that broke real pages:
 * - watchlist `fields` + `hydrate` used to 400 because the projection dropped
 *   fields the hydrated response union requires.
 * - (kept here so future contract additions have a home with the same pattern)
 */
const suite = new Suite("18-api-regressions");

interface WatchlistItem {
	id: string;
	metadataId: string;
	createdAt?: string;
	profileId?: string;
	updatedAt?: string;
	metadata?: { id?: string; title?: string };
}

async function main(): Promise<void> {
	const state = ensure(readState(), "run 00-bootstrap first");
	const admin = new Api().withCookie(state.adminCookie);
	const profileHeaders = { "x-profile-id": state.adminProfileId };
	const movie = ensure(state.movies[0], "bootstrap seeded no movies");

	await suite.case("watchlist fields + hydrate returns the hydrated union", async (s) => {
		const added = await admin.post("/v1/me/watchlist", { body: { metadataId: movie.metadataId }, headers: profileHeaders });
		s.expect(added.status === 200, `watchlist add -> ${added.status} ${JSON.stringify(added.body)}`);

		try {
			const response = await admin.get<{ data?: WatchlistItem[]; total?: number }>("/v1/me/watchlist", {
				query: { fields: "id,metadataId,createdAt", hydrate: true },
				headers: profileHeaders,
			});
			s.expect(response.status === 200, `hydrated watchlist -> ${response.status} ${JSON.stringify(response.body).slice(0, 200)}`);
			const item = (response.body.data ?? []).find((entry) => entry.metadataId === movie.metadataId);
			s.expect(Boolean(item), "watchlist item missing from the hydrated response");
			s.expect(Boolean(item?.metadata?.id), "hydrated item carries no metadata card");
			s.expect(Boolean(item?.profileId && item?.updatedAt), "hydrated item is missing full entity fields");
		} finally {
			await admin.delete(`/v1/me/watchlist/${movie.metadataId}`, { headers: profileHeaders });
		}
	});

	await suite.case("watchlist still accepts a plain projected list", async (s) => {
		const response = await admin.get<{ data?: WatchlistItem[] }>("/v1/me/watchlist", {
			query: { fields: "id,metadataId,createdAt" },
			headers: profileHeaders,
		});
		s.expect(response.status === 200, `projected watchlist -> ${response.status} ${JSON.stringify(response.body).slice(0, 200)}`);
	});

	await suite.case("plugin UI manifests pass the host dialog-reference validation", async (s) => {
		// The server refuses to load a plugin whose schema opens an undeclared
		// dialog — the installed bug-reports plugin must keep passing that check.
		const response = await admin.get<Array<{ id: string; state: string }>>("/v1/admin/plugins");
		s.expect(response.status === 200, `admin plugins -> ${response.status}`);
		const bugReports = (response.body ?? []).find((plugin) => plugin.id === "org.reelvault.bug-reports");
		s.expect(Boolean(bugReports), "bug-reports plugin not installed");
		s.expect(bugReports?.state === "enabled", `bug-reports state: ${bugReports?.state}`);
	});

	await suite.finish();
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
