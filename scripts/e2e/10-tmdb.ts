import { Api } from "./lib/client";
import { ensure, Suite } from "./lib/report";
import { loadKeys, readState } from "./lib/state";

const suite = new Suite("10-tmdb");

interface SearchGroup {
	providerId: string;
	results: Array<{ externalId: string; title: string; releaseDate?: string }>;
}
interface ProviderConfiguration {
	id: string;
	priority: number;
	enabled: boolean;
}

async function main(): Promise<void> {
	const keys = await loadKeys();
	const state = ensure(readState(), "run 00-bootstrap first");
	const admin = new Api().withCookie(state.adminCookie);

	await suite.case("tmdb provider registered and enabled", async (s) => {
		const providers = await admin.get<Array<{ id: string; pluginId: string }>>("/v1/providers");
		s.expect(providers.status === 200, `GET /v1/providers -> ${providers.status}`);
		s.expect(
			providers.body.some((provider) => provider.id === "tmdb" && provider.pluginId === "org.reelvault.tmdb"),
			"tmdb provider missing from registry",
		);
		const configs = await admin.get<ProviderConfiguration[]>("/v1/providers/configurations");
		const tmdb = configs.body.find((provider) => provider.id === "tmdb");
		s.expect(tmdb?.enabled === true, `tmdb enabled=${tmdb?.enabled}`);
	});

	await suite.case("search movie by title returns Sintel", async (s) => {
		const response = await admin.post<SearchGroup[]>("/v1/providers/search", { body: { type: "movie", title: "Sintel" } });
		s.expect(response.status === 200, `search -> ${response.status} ${JSON.stringify(response.body)}`);
		const hit = response.body
			.find((group) => group.providerId === "tmdb")
			?.results.find((item) => item.title.toLowerCase().includes("sintel"));
		s.expect(hit?.externalId === "45745", `Sintel not matched by TMDB: ${JSON.stringify(response.body)}`);
	});

	await suite.case("search movie by title+year is scoped", async (s) => {
		const response = await admin.post<SearchGroup[]>("/v1/providers/search", { body: { type: "movie", title: "Sintel", year: 2010 } });
		s.expect(response.status === 200, `search -> ${response.status}`);
		const results = response.body.find((group) => group.providerId === "tmdb")?.results ?? [];
		s.expect(results.length > 0, "no results for Sintel 2010");
	});

	await suite.case("search tv_show returns Friends", async (s) => {
		const response = await admin.post<SearchGroup[]>("/v1/providers/search", { body: { type: "tv_show", title: "Friends" } });
		s.expect(response.status === 200, `search -> ${response.status}`);
		const hit = response.body
			.find((group) => group.providerId === "tmdb")
			?.results.find((item) => item.title.toLowerCase().includes("friends"));
		s.expect(Boolean(hit), "Friends not in tv results");
	});

	await suite.case("identify by providerId+externalId resolves details", async (s) => {
		const details = await admin.post<SearchGroup[]>("/v1/providers/search", {
			body: { type: "movie", providerId: "tmdb", externalId: "45745" },
		});
		s.expect(details.status === 200, `identify -> ${details.status} ${JSON.stringify(details.body)}`);
		const hit = details.body.find((group) => group.providerId === "tmdb")?.results.find((item) => item.externalId === "45745");
		s.expect((hit?.title ?? "").toLowerCase().includes("sintel"), `expected Sintel, got ${hit?.title}`);
	});

	await suite.case("providerId without externalId is rejected with clear contract", async (s) => {
		const response = await admin.post<object>("/v1/providers/search", { body: { type: "movie", title: "Sintel", providerId: "tmdb" } });
		s.expect(response.status === 400, `expected 400 (both providerId+externalId required), got ${response.status}`);
	});

	await suite.case("invalid search body is rejected with 422", async (s) => {
		const response = await admin.post<object>("/v1/providers/search", { body: { type: "movie", year: 10 } });
		s.expect(response.status === 422 || response.status === 400, `expected 4xx, got ${response.status}`);
	});

	await suite.case("broken api key degrades gracefully and plugin survives", async (s) => {
		if (!keys.tmdbApiKey) return s.expect(false, "TMDB key missing");
		const broken = await admin.put("/v1/admin/plugins/org.reelvault.tmdb/config", {
			cookie: state.adminCookie,
			body: { apiKey: "invalid-key-for-e2e-degradation-test" },
		});
		s.expect(broken.status === 200, `PUT broken key -> ${broken.status}`);
		await Bun.sleep(500);
		const response = await admin.post<unknown>("/v1/providers/search", { body: { type: "movie", title: "Sintel" } });
		s.expect(response.status !== 500, `search with broken key crashed: ${response.status} ${JSON.stringify(response.body)}`);
		const plugins = await admin.get<Array<{ id: string; state: string }>>("/v1/admin/plugins", { cookie: state.adminCookie });
		const tmdb = plugins.body.find((plugin) => plugin.id === "org.reelvault.tmdb");
		s.expect(tmdb?.state === "enabled", `tmdb state after broken key: ${tmdb?.state}`);
		const restored = await admin.put("/v1/admin/plugins/org.reelvault.tmdb/config", {
			cookie: state.adminCookie,
			body: { apiKey: keys.tmdbApiKey, language: "pl-PL", fallbackLanguage: "en-US" },
		});
		s.expect(restored.status === 200, `restore key -> ${restored.status}`);
		await Bun.sleep(500);
		const after = await admin.post<SearchGroup[]>("/v1/providers/search", { body: { type: "movie", title: "Sintel" } });
		s.expect((after.body.find((group) => group.providerId === "tmdb")?.results ?? []).length > 0, "search broken after key restore");
	});

	await suite.finish();
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
