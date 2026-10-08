import { Api } from "./lib/client";
import { readCatalogVersion, resolvePluginZip } from "./lib/plugin-zips";
import { ensure, Suite } from "./lib/report";
import { readState } from "./lib/state";

const suite = new Suite("23-upgrade-catalog");

async function main(): Promise<void> {
	const state = ensure(readState(), "run 00-bootstrap first");
	const admin = new Api().withCookie(state.adminCookie);

	await suite.case("catalog lists official repository entries", async (s) => {
		const catalog = await admin.get<Array<{ id: string; versions?: unknown[] }>>("/v1/admin/plugins/catalog");
		s.expect(catalog.status === 200, `catalog -> ${catalog.status}`);
		const trailers = catalog.body.find((entry) => entry.id === "org.reelvault.trailers");
		s.expect(Boolean(trailers), "trailers missing from catalog");
	});

	await suite.case("catalog entries expose install status and version", async (s) => {
		const catalog =
			await admin.get<Array<{ id: string; version: string; status: string; installedVersion: string | null; repositoryId: string }>>(
				"/v1/admin/plugins/catalog",
			);
		const requests = catalog.body.find((entry) => entry.id === "org.reelvault.requests");
		s.expect(Boolean(requests), "requests missing from catalog");
		s.expect(requests?.status === "installed", `catalog status: ${requests?.status}`);
		const requestsVersion = readCatalogVersion("org.reelvault.requests") ?? "1.0.0";
		s.expect(requests?.installedVersion === requestsVersion, `installedVersion: ${requests?.installedVersion}`);
		s.expect(Boolean(requests?.repositoryId), "repositoryId missing from catalog entry");
	});

	await suite.case("config survives upload-upgrade (preserveMutableConfig)", async (s) => {
		const set = await admin.put("/v1/admin/plugins/org.reelvault.webhooks/config", {
			cookie: state.adminCookie,
			body: { onPlaybackStarted: true, serverPublicUrl: "https://e2e.example.com" },
		});
		s.expect(set.status === 200, `set config -> ${set.status}`);
		const form = new FormData();
		form.append("file", Bun.file(resolvePluginZip("org.reelvault.webhooks")));
		const upgraded = await admin.post<{ upgraded?: boolean }>("/v1/admin/plugins/install-upload", { form });
		s.expect(upgraded.status === 200 || upgraded.status === 201, `upgrade -> ${upgraded.status} ${JSON.stringify(upgraded.body)}`);
		const read = await admin.get<{ config: Record<string, unknown> }>("/v1/admin/plugins/org.reelvault.webhooks/config", {
			cookie: state.adminCookie,
		});
		s.expectEqual(read.body.config.onPlaybackStarted, true, "onPlaybackStarted preserved after upgrade");
		s.expectEqual(read.body.config.serverPublicUrl, "https://e2e.example.com", "serverPublicUrl preserved after upgrade");
		const restore = await admin.put("/v1/admin/plugins/org.reelvault.webhooks/config", {
			cookie: state.adminCookie,
			body: { onPlaybackStarted: false },
		});
		s.expect(restore.status === 200, `restore -> ${restore.status}`);
	});

	await suite.case("catalog install path installs an uninstalled plugin", async (s) => {
		const repositories = await admin.get<Array<{ id: string }>>("/v1/admin/plugins/repositories");
		const official = repositories.body[0];
		s.expect(Boolean(official?.id), "no catalog repository configured");
		const before = await admin.get<Array<{ id: string; state: string }>>("/v1/admin/plugins");
		const wasEnabled = before.body.find((plugin) => plugin.id === "org.reelvault.trailers")?.state === "enabled";
		if (wasEnabled) {
			const removed = await admin.post("/v1/admin/plugins/org.reelvault.trailers/uninstall");
			s.expect(removed.status === 200, `uninstall -> ${removed.status}`);
			const gone = await admin.get("/v1/plugins/org.reelvault.trailers/stats");
			s.expect(gone.status === 404, `route after uninstall -> ${gone.status}`);
		}
		const install = await admin.post<{ pluginId?: string }>("/v1/admin/plugins/catalog/install", {
			cookie: state.adminCookie,
			body: {
				repositoryId: official.id,
				pluginId: "org.reelvault.trailers",
				version: readCatalogVersion("org.reelvault.trailers") ?? "1.0.0",
			},
		});
		s.expect(install.status === 200 || install.status === 201, `catalog install -> ${install.status} ${JSON.stringify(install.body)}`);
		await Bun.sleep(1_000);
		const after = await admin.get<Array<{ id: string; state: string }>>("/v1/admin/plugins");
		s.expect(
			after.body.find((plugin) => plugin.id === "org.reelvault.trailers")?.state === "enabled",
			"trailers not enabled after catalog install",
		);
		const probe = await admin.get("/v1/plugins/org.reelvault.trailers/stats");
		s.expect(probe.status === 200, `trailers route after catalog install -> ${probe.status}`);
	});

	await suite.case("catalog install of unknown plugin id is rejected", async (s) => {
		const response = await admin.post<object>("/v1/admin/plugins/catalog/install", {
			cookie: state.adminCookie,
			body: { pluginId: "org.evil.nonexistent" },
		});
		s.expect(
			response.status === 400 || response.status === 404 || response.status === 422,
			`unknown catalog install -> ${response.status}`,
		);
	});

	await suite.finish();
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
