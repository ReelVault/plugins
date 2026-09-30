import { Api } from "./lib/client";
import { ensure, Suite } from "./lib/report";
import { loadKeys, readState } from "./lib/state";

const suite = new Suite("11-omdb");

interface SearchGroup {
	providerId: string;
	results: Array<{ externalId: string; title: string; releaseDate?: string }>;
}

async function main(): Promise<void> {
	const keys = await loadKeys();
	const state = ensure(readState(), "run 00-bootstrap first");
	const admin = new Api().withCookie(state.adminCookie);
	const hasKey = Boolean(keys.omdbApiKey);

	await suite.case("omdb provider registered and enabled", async (s) => {
		const providers = await admin.get<Array<{ id: string; pluginId: string }>>("/v1/providers");
		s.expect(providers.status === 200, `GET /v1/providers -> ${providers.status}`);
		s.expect(
			providers.body.some((provider) => provider.id === "imdb" && provider.pluginId === "org.reelvault.omdb"),
			"omdb provider (id=imdb) missing from registry",
		);
		const configs = await admin.get<Array<{ id: string; enabled: boolean }>>("/v1/providers/configurations");
		s.expect(configs.body.find((provider) => provider.id === "imdb")?.enabled === true, "omdb provider not enabled");
	});

	await suite.case(
		"search movie via omdb returns Inception with tt-id",
		async (s) => {
			const response = await admin.post<SearchGroup[]>("/v1/providers/search", {
				body: { type: "movie", title: "Inception", providerId: "imdb", externalId: "tt1375666" },
			});
			s.expect(response.status === 200, `identify -> ${response.status} ${JSON.stringify(response.body)}`);
			const hit = response.body.find((group) => group.providerId === "imdb")?.results.find((item) => item.externalId === "tt1375666");
			s.expect((hit?.title ?? "").toLowerCase().includes("inception"), `expected Inception, got ${hit?.title}`);
		},

		hasKey ? undefined : "OMDb key missing (E2E_OMDB_KEY)",
	);

	await suite.case(
		"title search via omdb returns tt-ids",
		async (s) => {
			const response = await admin.post<SearchGroup[]>("/v1/providers/search", { body: { type: "movie", title: "Inception" } });
			s.expect(response.status === 200, `search -> ${response.status}`);
			const group = response.body.find((entry) => entry.providerId === "imdb");
			s.expect(Boolean(group), "no imdb group in aggregated search");
			const hit = group?.results.find((item) => item.title.toLowerCase().includes("inception"));
			s.expect(hit?.externalId.startsWith("tt") === true, `externalId not tt-id: ${group?.results[0]?.externalId}`);
		},

		hasKey ? undefined : "OMDb key missing (E2E_OMDB_KEY)",
	);

	await suite.case(
		"search tv_show via omdb returns Breaking Bad",
		async (s) => {
			const response = await admin.post<SearchGroup[]>("/v1/providers/search", { body: { type: "tv_show", title: "Breaking Bad" } });
			s.expect(response.status === 200, `search -> ${response.status}`);
			const hit = response.body
				.find((group) => group.providerId === "imdb")
				?.results.find((item) => item.title.toLowerCase().includes("breaking bad"));
			s.expect(Boolean(hit), "Breaking Bad not in omdb tv results");
		},

		hasKey ? undefined : "OMDb key missing (E2E_OMDB_KEY)",
	);

	await suite.case(
		"unknown external id degrades without crash",
		async (s) => {
			const response = await admin.post<SearchGroup[]>("/v1/providers/search", {
				body: { type: "movie", providerId: "imdb", externalId: "tt0000000" },
			});
			s.expect(response.status === 200 || response.status === 404 || response.status === 400, `unexpected status ${response.status}`);
			const plugins = await admin.get<Array<{ id: string; state: string }>>("/v1/admin/plugins", { cookie: state.adminCookie });
			s.expect(plugins.body.find((plugin) => plugin.id === "org.reelvault.omdb")?.state === "enabled", "omdb disabled after bad lookup");
		},

		hasKey ? undefined : "OMDb key missing (E2E_OMDB_KEY)",
	);

	await suite.finish();
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
