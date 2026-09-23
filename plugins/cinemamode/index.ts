import { definePlugin, fail, ok } from "reelvault-sdk/plugin";
import { config } from "./config";
import { PreRollManager } from "./src/pre-roll.manager";
import type { PreRollResponse } from "./types";

export default definePlugin(config, {
	async setup(host) {
		const manager = new PreRollManager(host, host.config);

		host.logger.info("Cinemamode plugin initialized", {
			enabled: host.config.enabled,
			trailerCount: host.config.trailerCount,
			libraryOnly: host.config.libraryOnly,
		});

		// Declared in ui.json as playbackPreRoll — the player consults this route
		// before starting playback and plays the returned trailers first.
		await host.routes.register({
			method: "GET",
			path: "/pre-roll",
			handler: async ({ query }) => {
				const mediaFileId = typeof query.mediaFileId === "string" ? query.mediaFileId : "";
				if (!mediaFileId) return fail(400, "invalid_request", { field: "mediaFileId" });

				const result: PreRollResponse = await manager.getPreRoll(mediaFileId);
				return ok(result);
			},
		});

		// Admin diagnostics: what the overlay would play for a given file right now.
		await host.routes.register({
			method: "GET",
			path: "/preview",
			access: "admin",
			handler: async ({ query }) => {
				const mediaFileId = typeof query.mediaFileId === "string" ? query.mediaFileId : "";
				if (!mediaFileId) return fail(400, "invalid_request", { field: "mediaFileId" });

				const result: PreRollResponse = await manager.getPreRoll(mediaFileId);
				return ok({
					...result,
					config: { enabled: host.config.enabled, trailerCount: host.config.trailerCount, libraryOnly: host.config.libraryOnly },
				});
			},
		});
	},
});
