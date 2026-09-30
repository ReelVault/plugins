import { Api, expectWait } from "./lib/client";
import { ensure, Suite } from "./lib/report";
import { restartServer } from "./lib/server";
import { PLUGIN_ZIPS, readState } from "./lib/state";

const suite = new Suite("40-restart-persistence");

async function main(): Promise<void> {
	const state = ensure(readState(), "run 00-bootstrap first");
	const admin = new Api().withCookie(state.adminCookie);
	const userA = new Api().withCookie(state.userACookie);

	await suite.case("server restarts cleanly", async () => {
		await restartServer();
		const health = await expectWait(
			() => new Api().get<{ status: string }>("/v1/health").then((r) => (r.status === 200 ? r.body : null)),
			"health after restart",
			60_000,
			1_000,
		);
		suite.expect(health?.status === "ok", "health not ok after restart");
	});

	await suite.case("all plugins reload from disk after restart", async (s) => {
		const plugins = await expectWait(
			async () => {
				const response = await admin.get<Array<{ id: string; state: string }>>("/v1/admin/plugins");
				if (response.status !== 200) return null;
				const enabled = response.body.filter((plugin) => plugin.state === "enabled").map((plugin) => plugin.id);
				return PLUGIN_ZIPS.every((id) => enabled.includes(id)) ? enabled : null;
			},
			"all 8 plugins enabled after restart",
			60_000,
			1_500,
		);
		s.expect(plugins.length === PLUGIN_ZIPS.length, `expected 8 enabled, got ${plugins.length}`);
	});

	await suite.case("plugin config persists across restart", async (s) => {
		const read = await admin.get<{ config: Record<string, unknown> }>("/v1/admin/plugins/org.reelvault.tmdb/config");
		s.expect(read.status === 200, `config GET -> ${read.status}`);
		s.expectEqual(read.body.config.language, "pl-PL", "tmdb language persisted");
	});

	await suite.case("plugin storage persists across restart", async (s) => {
		const response = await admin.get<{ requests: Array<{ id: string }> }>("/v1/plugins/org.reelvault.requests/requests", {
			query: { scope: "all" },
		});
		s.expect(response.status === 200, `requests after restart -> ${response.status}`);
		s.expect(response.body.requests.length > 0, "requests storage empty after restart");
	});

	await suite.case("plugin routes serve traffic after restart", async (s) => {
		const trailers = await admin.get("/v1/plugins/org.reelvault.trailers/stats");
		s.expect(trailers.status === 200, `trailers stats -> ${trailers.status}`);
		const markers = await userA.get("/v1/plugins/org.reelvault.community-markers/admin/segments");
		s.expect(markers.status === 403, `markers admin route as user should 403, got ${markers.status}`);
	});

	await suite.finish();
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
