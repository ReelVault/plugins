import { Api } from "./lib/client";
import { ensure, Suite } from "./lib/report";
import { readState } from "./lib/state";

const suite = new Suite("41-reload-under-load");

async function main(): Promise<void> {
	const state = ensure(readState(), "run 00-bootstrap first");
	const admin = new Api().withCookie(state.adminCookie);
	const userA = new Api().withCookie(state.userACookie);

	await suite.case("reload-all under concurrent plugin traffic keeps routes healthy", async (s) => {
		let stopped = false;
		const statuses: number[] = [];

		const traffic = (async () => {
			for (;;) {
				if (stopped) break;
				const stats = await userA.get("/v1/plugins/org.reelvault.trailers/stats");
				const summary = await userA.get("/v1/plugins/org.reelvault.requests/requests/summary");
				statuses.push(stats.status, summary.status);
				await Bun.sleep(40);
			}
		})();

		await Bun.sleep(500);
		const reload = await admin.post("/v1/admin/plugins/reload");
		s.expect(reload.status === 200, `reload-all -> ${reload.status}`);
		await Bun.sleep(1_500);
		stopped = true;
		await traffic;

		const serverErrors = statuses.filter((status) => status >= 500);
		s.expect(serverErrors.length === 0, `${serverErrors.length}/${statuses.length} responses were 5xx during reload`);
		s.expect(statuses.length > 20, `traffic loop too short: ${statuses.length} requests`);

		const recovered = await userA.get("/v1/plugins/org.reelvault.trailers/stats");
		s.expect(recovered.status === 200, `stats after reload -> ${recovered.status}`);
	});

	await suite.case("disable -> enable cycle restores plugin routes", async (s) => {
		const disabled = await admin.post("/v1/admin/plugins/org.reelvault.trailers/disable");
		s.expect(disabled.status === 200, `disable -> ${disabled.status}`);
		const gone = await userA.get("/v1/plugins/org.reelvault.trailers/stats");
		s.expect(gone.status === 404, `route while disabled -> ${gone.status}`);
		const enabled = await admin.post("/v1/admin/plugins/org.reelvault.trailers/enable");
		s.expect(enabled.status === 200, `enable -> ${enabled.status}`);
		const back = await userA.get("/v1/plugins/org.reelvault.trailers/stats");
		s.expect(back.status === 200, `route after enable -> ${back.status}`);
	});

	await suite.case("disabled plugin disappears from user ui manifest", async (s) => {
		await admin.post("/v1/admin/plugins/org.reelvault.bug-reports/disable");
		const manifest = await userA.get<{ plugins: Record<string, unknown> }>("/v1/plugins/ui/manifest");
		s.expect(!("org.reelvault.bug-reports" in (manifest.body.plugins ?? {})), "disabled plugin still in ui manifest");
		await admin.post("/v1/admin/plugins/org.reelvault.bug-reports/enable");
		const restored = await userA.get<{ plugins: Record<string, unknown> }>("/v1/plugins/ui/manifest");
		s.expect("org.reelvault.bug-reports" in (restored.body.plugins ?? {}), "re-enabled plugin missing from ui manifest");
	});

	await suite.finish();
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
