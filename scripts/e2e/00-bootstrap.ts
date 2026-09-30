import { existsSync } from "node:fs";
import { join } from "node:path";
import { Api, expectWait, extractData, waitForHealth } from "./lib/client";
import { ensure, Suite } from "./lib/report";
import { isSupervisorRunning } from "./lib/server";
import {
	ADMIN_ACCOUNT,
	BASE_URL,
	DATA_DIR,
	E2E_ROOT,
	type E2eState,
	ensureDirs,
	loadKeys,
	MEDIA_DIR,
	MOVIES_DIR,
	type MovieInfo,
	PLUGIN_ZIPS,
	PLUGINS_DIST,
	readState,
	SERIES_DIR,
	STAGING_DIR,
	saveKeys,
	USER_A,
	USER_B,
	writeState,
} from "./lib/state";

const suite = new Suite("00-bootstrap");

async function loginOrReuse(api: Api, email: string, password: string, cached: string | undefined): Promise<string> {
	if (cached) {
		const probe = await api.get("/v1/auth/sessions", { cookie: cached });
		if (probe.status === 200) return cached;
	}
	return api.login(email, password, BASE_URL);
}

async function registerOrLogin(api: Api, account: { email: string; password: string; username: string }): Promise<string> {
	const login = await api.login(account.email, account.password, BASE_URL).catch(() => null);
	if (login) return login;
	const register = await api.post("/v1/auth/register", {
		body: { email: account.email, password: account.password, username: account.username },
		headers: { origin: BASE_URL },
	});
	if (register.status !== 200 && register.status !== 400 && register.status !== 422) {
		throw new Error(`register ${account.email}: ${register.status} ${JSON.stringify(register.body)}`);
	}
	return api.login(account.email, account.password, BASE_URL);
}

async function firstProfileId(api: Api, cookie: string, name: string): Promise<string> {
	const response = await api.get<Array<{ id: string; userId: string; name: string }>>("/v1/profiles", { cookie });
	suite.expect(response.status === 200, `GET /v1/profiles -> ${response.status}`);
	const existing = extractData<{ id: string; name: string }>(response.body)[0];
	if (existing) return existing.id;
	const created = await api.post<{ id: string }>("/v1/profiles", { cookie, body: { name } });
	suite.expect(created.status === 200 || created.status === 201, `POST /v1/profiles -> ${created.status} ${JSON.stringify(created.body)}`);
	return created.body.id;
}

function generateClip(target: string, seconds: number): void {
	if (existsSync(target)) return;
	const proc = Bun.spawnSync([
		"ffmpeg",
		"-y",
		"-f",
		"lavfi",
		"-i",
		`testsrc=duration=${seconds}:size=640x360:rate=24`,
		"-f",
		"lavfi",
		"-i",
		`sine=frequency=440:duration=${seconds}`,
		"-c:v",
		"libx264",
		"-preset",
		"ultrafast",
		"-c:a",
		"aac",
		"-shortest",
		target,
	]);
	suite.expect(proc.exitCode === 0, `ffmpeg failed for ${target}: ${proc.stderr.toString().slice(-300)}`);
}

async function ensureLibrary(api: Api, cookie: string, name: string, type: "movies" | "tv_shows", path: string): Promise<string> {
	const list = await api.get("/v1/libraries", { cookie });
	suite.expect(list.status === 200, `GET /v1/libraries -> ${list.status}`);
	const existing = extractData<{ id: string; name: string }>(list.body).find((library) => library.name === name);
	if (existing) return existing.id;
	const created = await api.post<{ id: string }>("/v1/libraries", {
		cookie,
		body: { name, type, paths: [{ path }] },
	});
	suite.expect(
		created.status === 200 || created.status === 201,
		`create library ${name} -> ${created.status} ${JSON.stringify(created.body)}`,
	);
	return created.body.id;
}

async function listMediaFiles(api: Api, cookie: string, libraryId: string): Promise<Array<{ id: string; metadataId?: string | null }>> {
	const response = await api.get("/v1/media-files", { cookie, query: { libraryId, pageSize: 100 } });
	suite.expect(response.status === 200, `GET /v1/media-files -> ${response.status}`);
	return extractData<{ id: string; metadataId?: string | null }>(response.body);
}

async function installMissingPlugins(api: Api, cookie: string): Promise<string[]> {
	const before = await api.get<Array<{ id: string; state: string }>>("/v1/admin/plugins", { cookie });
	suite.expect(before.status === 200, `GET /admin/plugins -> ${before.status}`);
	const installed = new Set(extractData<{ id: string; state: string }>(before.body).map((plugin) => plugin.id));
	for (const pluginId of PLUGIN_ZIPS) {
		if (installed.has(pluginId)) continue;
		const zipPath = join(PLUGINS_DIST, pluginId, `${pluginId}-1.0.0.zip`);
		suite.expect(existsSync(zipPath), `missing dist zip: ${zipPath}`);
		const form = new FormData();
		form.append("file", Bun.file(zipPath));
		const response = await api.post<object>("/v1/admin/plugins/install-upload", { cookie, form });
		suite.expect(
			response.status === 200 || response.status === 201,
			`install-upload ${pluginId} -> ${response.status} ${JSON.stringify(response.body)}`,
		);
	}
	const after = await api.get<Array<{ id: string; state: string }>>("/v1/admin/plugins", { cookie });
	const enabled = new Set(
		extractData<{ id: string; state: string }>(after.body)
			.filter((plugin) => plugin.state === "enabled")
			.map((plugin) => plugin.id),
	);
	return PLUGIN_ZIPS.filter((pluginId) => enabled.has(pluginId));
}

async function main(): Promise<void> {
	ensureDirs();
	const keys = await loadKeys();
	if (process.env.E2E_TMDB_KEY || process.env.E2E_OMDB_KEY) {
		saveKeys(keys);
	}
	await suite.case("server starts and becomes healthy", async () => {
		suite.expect(
			isSupervisorRunning() || (await waitForHealth(BASE_URL)),
			"supervisor not running — start it with: bun run scripts/e2e/supervisor.ts",
		);
		const healthy = await expectWait(() => waitForHealth(BASE_URL), "server health", 60_000, 500);
		suite.expect(healthy, "server not healthy after 60s");
		const health = await new Api().get<{ status: string }>("/v1/health");
		suite.expect(health.status === 200 && health.body.status === "ok", `health -> ${health.status}`);
	});

	await suite.case("first-run setup creates admin", async () => {
		const api = new Api();
		const status = await api.get<{ required: boolean; tokenRequired: boolean }>("/v1/setup/status");
		suite.expect(status.status === 200, `GET /v1/setup -> ${status.status}`);
		if (status.body.required) {
			const created = await api.post("/v1/setup", {
				body: { name: ADMIN_ACCOUNT.name, email: ADMIN_ACCOUNT.email, password: ADMIN_ACCOUNT.password },
				headers: { origin: BASE_URL },
			});
			suite.expect(created.status === 200 || created.status === 201, `POST /v1/setup -> ${created.status} ${JSON.stringify(created.body)}`);
		}
	});

	const state: Partial<E2eState> = readState() ?? {};

	const adminCookie = await suite.case("admin login works", async () => {
		const api = new Api();
		const cookie = await loginOrReuse(api, ADMIN_ACCOUNT.email, ADMIN_ACCOUNT.password, state.adminCookie);
		const probe = await api.get("/v1/profiles", { cookie });
		suite.expect(probe.status === 200, `admin session probe -> ${probe.status}`);
		return cookie;
	});
	state.adminCookie = adminCookie as string;

	await suite.case("regular users registered and logged in", async () => {
		const api = new Api();
		const enabled = await api.patch("/v1/admin/settings", {
			cookie: state.adminCookie,
			body: { "auth.allowRegistration": true },
		});
		suite.expect(enabled.status === 200, `PATCH /v1/admin/settings -> ${enabled.status} ${JSON.stringify(enabled.body)}`);
		state.userACookie = await registerOrLogin(api, USER_A);
		state.userBCookie = await registerOrLogin(api, USER_B);
		suite.expect(Boolean(state.userACookie && state.userBCookie), "user cookies missing");
	});

	await suite.case("profiles resolve per account", async () => {
		state.adminProfileId = await firstProfileId(new Api(), state.adminCookie as string, "Admin");
		state.userAProfileId = await firstProfileId(new Api(), state.userACookie as string, "User A");
		state.userBProfileId = await firstProfileId(new Api(), state.userBCookie as string, "User B");
		suite.expect(state.adminProfileId !== state.userAProfileId, "admin and user A share profile id");
	});

	await suite.case("all 8 plugins installed and enabled", async () => {
		state.installedPlugins = await installMissingPlugins(new Api(), state.adminCookie as string);
		suite.expectEqual(state.installedPlugins.length, PLUGIN_ZIPS.length, "enabled plugin count");
	});

	await suite.case("tmdb plugin configured with api key", async (s) => {
		if (!keys.tmdbApiKey) return s.expect(false, "TMDB key missing (set E2E_TMDB_KEY)");
		const api = new Api();
		const response = await api.put("/v1/admin/plugins/org.reelvault.tmdb/config", {
			cookie: state.adminCookie,
			body: { apiKey: keys.tmdbApiKey, language: "pl-PL", fallbackLanguage: "en-US" },
		});
		s.expect(response.status === 200, `PUT tmdb config -> ${response.status} ${JSON.stringify(response.body)}`);
	});

	await suite.case("omdb plugin configured with api key", async (s) => {
		if (!keys.omdbApiKey) return s.expect(false, "OMDb key missing (set E2E_OMDB_KEY)");
		const api = new Api();
		const response = await api.put("/v1/admin/plugins/org.reelvault.omdb/config", {
			cookie: state.adminCookie,
			body: { apiKey: keys.omdbApiKey, plot: "full" },
		});
		s.expect(response.status === 200, `PUT omdb config -> ${response.status} ${JSON.stringify(response.body)}`);
	});

	await suite.case("trailers + cinemamode configured", async (s) => {
		const api = new Api();
		if (keys.tmdbApiKey) {
			const trailers = await api.put("/v1/admin/plugins/org.reelvault.trailers/config", {
				cookie: state.adminCookie,
				body: { apiKey: keys.tmdbApiKey, preferredLanguage: "pl-PL" },
			});
			s.expect(trailers.status === 200, `PUT trailers config -> ${trailers.status}`);
			const cinema = await api.put("/v1/admin/plugins/org.reelvault.cinemamode/config", {
				cookie: state.adminCookie,
				body: { enabled: true, tmdbApiKey: keys.tmdbApiKey, language: "pl-PL", trailerCount: 3, libraryOnly: true },
			});
			s.expect(cinema.status === 200, `PUT cinemamode config -> ${cinema.status}`);
		}
	});

	await suite.case("test media generated", async (s) => {
		await generateClip(join(MOVIES_DIR, "Sintel (2010).mp4"), 30);
		await generateClip(join(STAGING_DIR, "Tears of Steel (2012).mp4"), 30);
		const episodeDir = join(SERIES_DIR, "Friends (1994)", "Season 01");
		const { mkdirSync } = await import("node:fs");
		mkdirSync(episodeDir, { recursive: true });
		await generateClip(join(episodeDir, "Friends S01E01.mp4"), 30);
		for (const dir of [MEDIA_DIR, STAGING_DIR, MOVIES_DIR, SERIES_DIR, DATA_DIR, E2E_ROOT]) {
			s.expect(existsSync(dir), `dir missing: ${dir}`);
		}
	});

	await suite.case("libraries created", async () => {
		const adminCookie = ensure(state.adminCookie, "admin cookie");
		state.moviesLibraryId = await ensureLibrary(new Api(), adminCookie, "E2E Movies", "movies", MOVIES_DIR);
		state.seriesLibraryId = await ensureLibrary(new Api(), adminCookie, "E2E Series", "tv_shows", SERIES_DIR);
	});

	await suite.case("scan matches Sintel via TMDB", async () => {
		const api = new Api();
		const scan = await api.post(`/v1/libraries/${state.moviesLibraryId}/scan`, { cookie: state.adminCookie });
		suite.expect(scan.status === 202 || scan.status === 200 || scan.status === 409, `scan trigger -> ${scan.status}`);
		const info: MovieInfo | null = await expectWait(
			async () => {
				const items = await listMediaFiles(api, state.adminCookie as string, state.moviesLibraryId as string);
				for (const target of items) {
					if (!target.metadataId) continue;
					const metadata = await api.get<{ title?: string }>(`/v1/metadata/${target.metadataId}`, { cookie: state.adminCookie });
					if (metadata.status === 200 && metadata.body.title?.toLowerCase().includes("sintel")) {
						return {
							title: metadata.body.title,
							metadataId: target.metadataId,
							mediaFileId: target.id,
							libraryId: state.moviesLibraryId as string,
						};
					}
				}
				return null;
			},
			"Sintel matched",
			180_000,
			2_000,
		);
		state.movies = [info];
	});

	await suite.case("series scan matches Friends episode", async () => {
		const api = new Api();
		const scan = await api.post(`/v1/libraries/${state.seriesLibraryId}/scan`, { cookie: state.adminCookie });
		suite.expect(scan.status === 202 || scan.status === 200 || scan.status === 409, `scan trigger -> ${scan.status}`);
		const matched = await expectWait(
			async () => {
				const items = await listMediaFiles(api, state.adminCookie as string, state.seriesLibraryId as string);
				const target = items.find((item) => Boolean(item.metadataId));
				if (!target) return null;
				return { metadataId: target.metadataId as string, mediaFileId: target.id };
			},
			"episode matched",
			180_000,
			2_000,
		);
		const metadata = await api.get<{ title?: string }>(`/v1/metadata/${matched.metadataId}`, { cookie: state.adminCookie });
		suite.expect(metadata.status === 200 && Boolean(metadata.body.title), `series metadata -> ${metadata.status}`);
		state.seriesEpisode = matched;
	});

	await suite.case("state persisted", () => {
		const complete =
			state.adminCookie && state.userACookie && state.moviesLibraryId && state.seriesLibraryId && state.installedPlugins?.length === 8;
		suite.expect(Boolean(complete), `incomplete state: ${JSON.stringify(Object.keys(state))}`);
		writeState(state as E2eState);
	});

	await suite.finish();
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
