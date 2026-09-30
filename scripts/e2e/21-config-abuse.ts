import { Api } from "./lib/client";
import { ensure, Suite } from "./lib/report";
import { loadKeys, readState } from "./lib/state";

const suite = new Suite("21-config-abuse");

async function main(): Promise<void> {
	const keys = await loadKeys();
	const state = ensure(readState(), "run 00-bootstrap first");
	const admin = new Api().withCookie(state.adminCookie);
	const userA = new Api().withCookie(state.userACookie);

	await suite.case("config values outside declared range are rejected", async (s) => {
		const response = await admin.put<object>("/v1/admin/plugins/org.reelvault.cinemamode/config", {
			cookie: state.adminCookie,
			body: { trailerCount: 99 },
		});
		s.expect(response.status === 400 || response.status === 422, `trailerCount=99 accepted with ${response.status}`);
		const negative = await admin.put<object>("/v1/admin/plugins/org.reelvault.bug-reports/config", {
			cookie: state.adminCookie,
			body: { retentionDays: -5 },
		});
		s.expect(negative.status === 400 || negative.status === 422, `retentionDays=-5 accepted with ${negative.status}`);
	});

	await suite.case("invalid language pattern is rejected", async (s) => {
		const response = await admin.put<object>("/v1/admin/plugins/org.reelvault.tmdb/config", {
			cookie: state.adminCookie,
			body: { language: "not a bcp47 !!!" },
		});
		s.expect(response.status === 400 || response.status === 422, `bad language accepted with ${response.status}`);
	});

	await suite.case("unknown config fields are ignored or rejected, never stored", async (s) => {
		const response = await admin.put("/v1/admin/plugins/org.reelvault.cinemamode/config", {
			cookie: state.adminCookie,
			body: { evilField: "drop table users" },
		});
		s.expect(response.status === 200 || response.status === 400 || response.status === 422, `evil field -> ${response.status}`);
		const read = await admin.get<{ config: Record<string, unknown> }>("/v1/admin/plugins/org.reelvault.cinemamode/config", {
			cookie: state.adminCookie,
		});
		s.expect(!("evilField" in read.body.config), `evilField stored: ${JSON.stringify(read.body.config)}`);
	});

	await suite.case("secret values are never echoed back", async (s) => {
		const read = await admin.get<{ config: Record<string, unknown> }>("/v1/admin/plugins/org.reelvault.tmdb/config", {
			cookie: state.adminCookie,
		});
		s.expect(!("apiKey" in read.body.config), `apiKey echoed in config: ${JSON.stringify(read.body.config)}`);
		const fields = JSON.stringify(read.body);
		s.expect(!fields.includes("eyJhbGciOi"), "raw secret value leaked through config GET");
	});

	await suite.case("config roundtrip persists values", async (s) => {
		const set = await admin.put("/v1/admin/plugins/org.reelvault.cinemamode/config", {
			cookie: state.adminCookie,
			body: { language: "en-US" },
		});
		s.expect(set.status === 200, `set language -> ${set.status}`);
		const read = await admin.get<{ config: Record<string, unknown> }>("/v1/admin/plugins/org.reelvault.cinemamode/config", {
			cookie: state.adminCookie,
		});
		s.expectEqual(read.body.config.language, "en-US", "language roundtrip");
		const restore = await admin.put("/v1/admin/plugins/org.reelvault.cinemamode/config", {
			cookie: state.adminCookie,
			body: { language: "pl-PL" },
		});
		s.expect(restore.status === 200, `restore language -> ${restore.status}`);
	});

	await suite.case("non-admin cannot read or write plugin config", async (s) => {
		const read = await userA.get<object>("/v1/admin/plugins/org.reelvault.tmdb/config");
		s.expect(read.status === 403, `user GET config -> ${read.status}`);
		const write = await userA.put<object>("/v1/admin/plugins/org.reelvault.tmdb/config", { body: { language: "de-DE" } });
		s.expect(write.status === 403, `user PUT config -> ${write.status}`);
	});

	await suite.case("broken key does not brick the config surface", async (s) => {
		if (!keys.tmdbApiKey) return;
		const read = await admin.get<{ fields: { name: string; type: string }[] }>("/v1/admin/plugins/org.reelvault.tmdb/config", {
			cookie: state.adminCookie,
		});
		s.expect(
			read.body.fields.some((field) => field.name === "apiKey" && field.type === "secret"),
			"apiKey field schema missing",
		);
	});

	await suite.finish();
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
