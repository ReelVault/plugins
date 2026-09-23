import { definePlugin } from "reelvault-sdk/plugin";
import { config } from "./config";
import { createTmdbProvider } from "./src/provider";

export default definePlugin(config, {
	async setup(host) {
		await host.providers.register(createTmdbProvider(host.config));
		host.logger.info("TMDB metadata plugin initialized");
	},
});
