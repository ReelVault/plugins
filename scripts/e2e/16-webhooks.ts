import { Api, expectWait } from "./lib/client";
import { ensure, Suite } from "./lib/report";
import { readState } from "./lib/state";

const suite = new Suite("16-webhooks");

interface HistoryEntry {
	id?: string;
	success?: boolean;
	error?: string;
	target?: string;
	channel?: string;
	status?: number;
	url?: string;
}
interface HistoryResponse {
	history?: HistoryEntry[];
	items?: HistoryEntry[];
}

const ECHO_URL = "https://postman-echo.com/post";

async function main(): Promise<void> {
	const state = ensure(readState(), "run 00-bootstrap first");
	const admin = new Api().withCookie(state.adminCookie);
	const userA = new Api().withCookie(state.userACookie);
	const base = "/v1/plugins/org.reelvault.webhooks";

	await suite.case("webhook admin routes are forbidden for user", async (s) => {
		const response = await userA.get<object>(`${base}/status`);
		s.expect(response.status === 403, `user /status -> ${response.status}`);
	});

	await suite.case("status reports channel config", async (s) => {
		const response = await admin.get<{ channels?: unknown; genericEnabled?: boolean }>(`${base}/status`);
		s.expect(response.status === 200, `status -> ${response.status} ${JSON.stringify(response.body)}`);
	});

	await suite.case("generic webhook delivers to public echo endpoint", async (s) => {
		const configured = await admin.put("/v1/admin/plugins/org.reelvault.webhooks/config", {
			cookie: state.adminCookie,
			body: { genericEnabled: true, genericWebhookUrl: ECHO_URL, onMediaReady: true, discordEnabled: false, telegramEnabled: false },
		});
		s.expect(configured.status === 200, `configure generic -> ${configured.status} ${JSON.stringify(configured.body)}`);
		await Bun.sleep(400);
		const sent = await admin.post<object>(`${base}/test`);
		s.expect(sent.status === 200, `POST /test -> ${sent.status} ${JSON.stringify(sent.body)}`);
		const history = await expectWait(
			async () => {
				const response = await admin.get<HistoryResponse>(`${base}/history`);
				const entries = response.body.history ?? response.body.items ?? [];
				const hit = entries.find((entry) => entry.success === true && entry.target === "generic");
				return hit ?? null;
			},
			"successful echo delivery",
			30_000,
			1_000,
		);
		s.expect(Boolean(history), "no successful delivery in history");
	});

	await suite.case("private-address webhook is blocked by SSRF guard and recorded", async (s) => {
		const configured = await admin.put("/v1/admin/plugins/org.reelvault.webhooks/config", {
			cookie: state.adminCookie,
			body: { genericEnabled: true, genericWebhookUrl: "http://127.0.0.1:9/exfil", discordEnabled: false, telegramEnabled: false },
		});
		s.expect(configured.status === 200, `configure loopback -> ${configured.status}`);
		await Bun.sleep(400);
		await admin.post(`${base}/test`);
		const response = await admin.get<HistoryResponse>(`${base}/history`);
		const entries = response.body.history ?? response.body.items ?? [];
		const blocked = entries.find((entry) => entry.success === false && entry.target === "generic");
		s.expect(Boolean(blocked), `loopback delivery not recorded as failure: ${JSON.stringify(entries.slice(0, 3))}`);
		s.expect(!JSON.stringify(entries).includes("delivered"), "loopback should never deliver");
	});

	await suite.case("invalid discord url fails cleanly and plugin survives", async (s) => {
		const configured = await admin.put("/v1/admin/plugins/org.reelvault.webhooks/config", {
			cookie: state.adminCookie,
			body: { discordEnabled: true, discordWebhookUrl: "https://discord.com/api/webhooks/1/invalid-token", genericEnabled: false },
		});
		s.expect(configured.status === 200, `configure discord -> ${configured.status}`);
		await Bun.sleep(400);
		const sent = await admin.post<object>(`${base}/test`);
		s.expect(sent.status === 200 || sent.status === 502, `test with broken discord -> ${sent.status}`);
		const plugins = await admin.get<Array<{ id: string; state: string }>>("/v1/admin/plugins", { cookie: state.adminCookie });
		s.expect(plugins.body.find((plugin) => plugin.id === "org.reelvault.webhooks")?.state === "enabled", "webhooks plugin degraded");
	});

	await suite.case("clear-history empties the log", async (s) => {
		const cleared = await admin.post<object>(`${base}/clear-history`);
		s.expect(cleared.status === 200, `clear-history -> ${cleared.status}`);
		const response = await admin.get<HistoryResponse>(`${base}/history`);
		const entries = response.body.history ?? response.body.items ?? [];
		s.expect(entries.length === 0, `history not empty after clear: ${entries.length}`);
	});

	await suite.finish();
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
