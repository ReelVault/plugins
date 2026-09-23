import { definePlugin, ok } from "@reelvault/sdk/plugin";
import { config } from "./config";
import { WebhookManager } from "./src/webhook-manager";

export default definePlugin(config, {
	async setup(host) {
		const manager = new WebhookManager(host, host.config);

		host.logger.info("Webhooks plugin initialized", {
			onMediaReady: host.config.onMediaReady,
			onPlaybackStarted: host.config.onPlaybackStarted,
			onPlaybackStopped: host.config.onPlaybackStopped,
		});

		await host.routes.register({
			method: "GET",
			path: "/status",
			access: "admin",
			handler: async () => ok(await manager.getStatus()),
		});

		await host.routes.register({
			method: "GET",
			path: "/history",
			access: "admin",
			handler: async () => ok(await manager.getHistory()),
		});

		await host.routes.register({
			method: "POST",
			path: "/test",
			access: "admin",
			handler: async () => ok(await manager.sendTest()),
		});

		await host.routes.register({
			method: "POST",
			path: "/clear-history",
			access: "admin",
			handler: async () => ok(await manager.clearHistory()),
		});

		host.events.on("media.file.ready", async (payload) => {
			if (host.config.onMediaReady) await manager.notifyMediaReady(payload.metadataId, payload.mediaFileId);
		});

		host.events.on("playback.lifecycle.started", async (payload) => {
			if (host.config.onPlaybackStarted) await manager.notifyPlaybackStarted(payload.mediaFileId);
		});

		host.events.on("playback.lifecycle.stopped", async (payload) => {
			if (host.config.onPlaybackStopped) await manager.notifyPlaybackStopped(payload.mediaFileId);
		});
	},
});
