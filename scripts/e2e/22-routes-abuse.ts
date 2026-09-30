import { join } from "node:path";
import { Api } from "./lib/client";
import { ensure, Suite } from "./lib/report";
import { PLUGINS_DIST, readState } from "./lib/state";

const suite = new Suite("22-routes-abuse");

async function ensureTrailersInstalled(admin: Api): Promise<boolean> {
	const plugins = await admin.get<{ id: string; state: string }[]>("/v1/admin/plugins");
	if (plugins.body.find((plugin) => plugin.id === "org.reelvault.trailers")?.state === "enabled") return true;
	const form = new FormData();
	form.append("file", Bun.file(join(PLUGINS_DIST, "org.reelvault.trailers", "org.reelvault.trailers-1.0.0.zip")));
	const response = await admin.post<object>("/v1/admin/plugins/install-upload", { form });
	return response.status === 200 || response.status === 201;
}

async function main(): Promise<void> {
	const state = ensure(readState(), "run 00-bootstrap first");
	const admin = new Api().withCookie(state.adminCookie);
	const userA = new Api().withCookie(state.userACookie);
	const userB = new Api().withCookie(state.userBCookie);
	const anonymous = new Api();
	const trailersUp = await ensureTrailersInstalled(admin);

	await suite.case("plugin routes require a session", async (s) => {
		const response = await anonymous.get<object>("/v1/plugins/org.reelvault.requests/requests/summary");
		s.expect(response.status === 401, `anonymous -> ${response.status}`);
	});

	await suite.case("unknown plugin id -> 404", async (s) => {
		const response = await admin.get<object>("/v1/plugins/org.reelvault.nonexistent/stats");
		s.expect(response.status === 404, `unknown plugin -> ${response.status}`);
	});

	await suite.case("unknown route within plugin -> 404", async (s) => {
		const response = await admin.get<object>("/v1/plugins/org.reelvault.requests/definitely-not-a-route");
		s.expect(response.status === 404, `unknown route -> ${response.status}`);
	});

	await suite.case("wrong method on existing route is handled", async (s) => {
		const response = await admin.delete<object>("/v1/plugins/org.reelvault.requests/genres");
		s.expect(response.status === 404 || response.status === 405 || response.status === 400, `wrong method -> ${response.status}`);
	});

	await suite.case(
		"encoded path traversal inside plugin path cannot escape scoping",
		async (s) => {
			const probes = [
				"/v1/plugins/org.reelvault.trailers/..%2F..%2Fadmin%2Fplugins",
				"/v1/plugins/org.reelvault.trailers/%2e%2e/%2e%2e/admin/plugins",
				"/v1/plugins/org.reelvault.trailers/..%252fadmin",
			];
			for (const probe of probes) {
				const response = await userB.get<object>(probe);
				const raw = JSON.stringify(response.body);
				s.expect(
					response.status !== 200 || !raw.includes("Bug Reports"),
					`traversal ${probe.slice(-28)} -> ${response.status} ${raw.slice(0, 100)}`,
				);
			}
		},
		trailersUp ? undefined : "trailers not installed (upload rate-limited earlier)",
	);

	await suite.case("oversized body to plugin route is rejected or handled", async (s) => {
		const big = "x".repeat(1_500_000);
		const response = await admin.post<object>("/v1/plugins/org.reelvault.trailers/cache-all", { body: { blob: big } });
		s.expect(
			response.status === 413 || response.status === 400 || response.status === 422 || response.status === 200,
			`oversized -> ${response.status}`,
		);
	});

	await suite.case("injection-ish and unicode queries do not crash", async (s) => {
		const probes = ["'; DROP TABLE users;--", "<script>alert(1)</script>", "🔥🎬💥", "%00%1B", "../../etc/passwd"];
		for (const probe of probes) {
			const response = await userB.get<object>("/v1/plugins/org.reelvault.requests/search", { query: { query: probe } });
			s.expect(
				response.status === 200 || response.status === 400 || response.status === 429,
				`probe ${JSON.stringify(probe.slice(0, 12))} -> ${response.status}`,
			);
		}
	});

	await suite.case("plugin route rate limit kicks in above 300/min", async (s) => {
		let saw429 = false;
		let lastStatus = 0;
		for (let index = 0; index < 320; index += 1) {
			const response = await userA.get<object>("/v1/plugins/org.reelvault.trailers/stats");
			lastStatus = response.status;
			if (response.status === 429) {
				saw429 = true;
				break;
			}
		}
		s.expect(saw429, `no 429 after burst (last ${lastStatus})`);
	});

	await suite.finish();
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
