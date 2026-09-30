import { Api, expectWait } from "./lib/client";
import { ensure, Suite } from "./lib/report";
import { BASE_URL, readState } from "./lib/state";

const suite = new Suite("30-roles-realtime");

interface UiPage {
	id: string;
	adminOnly?: boolean;
}
interface UiSurface {
	pages?: UiPage[];
}

function collectSurfaces(manifest: Record<string, UiSurface>): { adminIds: string[]; allIds: string[] } {
	const adminIds: string[] = [];
	const allIds: string[] = [];
	for (const [pluginId, surface] of Object.entries(manifest)) {
		for (const page of surface.pages ?? []) {
			allIds.push(`${pluginId}:${page.id}`);
			if (page.adminOnly) adminIds.push(`${pluginId}:${page.id}`);
		}
	}
	return { adminIds, allIds };
}

async function main(): Promise<void> {
	const state = ensure(readState(), "run 00-bootstrap first");
	const admin = new Api().withCookie(state.adminCookie);
	const userA = new Api().withCookie(state.userACookie);
	const userB = new Api().withCookie(state.userBCookie);

	await suite.case("ui manifest hides adminOnly surfaces from regular users", async (s) => {
		const adminManifest = await admin.get<{ plugins: Record<string, UiSurface> }>("/v1/plugins/ui/manifest");
		const userManifest = await userA.get<{ plugins: Record<string, UiSurface> }>("/v1/plugins/ui/manifest");
		s.expect(adminManifest.status === 200 && userManifest.status === 200, `manifests -> ${adminManifest.status}/${userManifest.status}`);
		const adminSurfaces = collectSurfaces(adminManifest.body.plugins ?? {});
		const userSurfaces = collectSurfaces(userManifest.body.plugins ?? {});
		s.expect(adminSurfaces.adminIds.length > 0, "no adminOnly surfaces visible to admin (fixture broken?)");
		const leaked = adminSurfaces.adminIds.filter((id) => userSurfaces.allIds.includes(id));
		s.expect(leaked.length === 0, `adminOnly surfaces leaked to user: ${leaked.join(", ")}`);
		s.expect(
			userSurfaces.allIds.some((id) => id.startsWith("org.reelvault.requests:")),
			"user-facing media-requests pages missing for user",
		);
	});

	await suite.case("user receives realtime plugin event when admin changes state", async (s) => {
		const created = await userB.post<{ request?: { id: string } }>("/v1/plugins/org.reelvault.requests/requests", {
			title: `Realtime Probe ${(Math.random() + 1).toString(36).slice(2, 7)}`,
			mediaType: "movie",
		});
		s.expect(created.status === 201 && Boolean(created.body.request?.id), `probe request -> ${created.status}`);
		const requestId = created.body.request?.id ?? "";

		const wsUrl = `${BASE_URL.replace("http", "ws")}/v1/events/ws?profileId=${state.userAProfileId}`;
		const messages: string[] = [];
		const socket = new WebSocket(wsUrl, { headers: { cookie: state.userACookie } });
		const opened = await new Promise<boolean>((resolve) => {
			const timer = setTimeout(() => resolve(false), 8_000);
			socket.addEventListener("open", () => {
				clearTimeout(timer);
				resolve(true);
			});
			socket.addEventListener("error", () => {
				clearTimeout(timer);
				resolve(false);
			});
		});
		try {
			s.expect(opened, "user websocket did not open");
			socket.addEventListener("message", (event) => {
				messages.push(typeof event.data === "string" ? event.data : "");
			});
			const approved = await admin.patch(`/v1/plugins/org.reelvault.requests/requests/${requestId}`, { body: { status: "approved" } });
			s.expect(approved.status === 200, `approve -> ${approved.status}`);
			const seen = await expectWait(
				() => {
					const hit = messages.find((message) => message.includes("requests.changed"));
					return hit ?? null;
				},
				"requests.changed event on user ws",
				20_000,
				500,
			);
			s.expect(Boolean(seen), "no requests.changed event received");
		} finally {
			socket.close();
			await userB.delete(`/v1/plugins/org.reelvault.requests/requests/${requestId}`);
		}
	});

	await suite.case("realtime fan-out carries no sensitive request data", async (s) => {
		const created = await userB.post<{ request?: { id: string } }>("/v1/plugins/org.reelvault.requests/requests", {
			title: `Foreign Scope Probe ${(Math.random() + 1).toString(36).slice(2, 7)}`,
			mediaType: "movie",
		});
		s.expect(created.status === 201, `probe -> ${created.status}`);
		const requestId = created.body.request?.id ?? "";

		const wsUrl = `${BASE_URL.replace("http", "ws")}/v1/events/ws?profileId=${state.userAProfileId}`;
		const socket = new WebSocket(wsUrl, { headers: { cookie: state.userACookie } });
		await new Promise<boolean>((resolve) => {
			socket.addEventListener("open", () => resolve(true));
			socket.addEventListener("error", () => resolve(false));
			setTimeout(() => resolve(false), 8_000);
		});
		const messages: string[] = [];
		socket.addEventListener("message", (event) => {
			messages.push(typeof event.data === "string" ? event.data : "");
		});
		try {
			await Bun.sleep(1_000);
			const approved = await admin.patch(`/v1/plugins/org.reelvault.requests/requests/${requestId}`, { body: { status: "approved" } });
			suite.expect(approved.status === 200, `approve -> ${approved.status}`);
			await Bun.sleep(2_500);
			const fanOut = messages.find((message) => message.includes("requests.changed"));
			suite.expect(Boolean(fanOut), "fan-out event missing for other connected client");
			if (fanOut) {
				const parsed = JSON.parse(fanOut) as { payload?: Record<string, unknown> };
				const payloadKeys = Object.keys(parsed.payload ?? {});
				suite.expect(
					payloadKeys.every((key) => ["action", "requestId", "metadataId"].includes(key)),
					`fan-out payload leaks request data: ${payloadKeys.join(",")}`,
				);
			}
		} finally {
			socket.close();
			await userB.delete(`/v1/plugins/org.reelvault.requests/requests/${requestId}`);
		}
	});

	await suite.finish();
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
