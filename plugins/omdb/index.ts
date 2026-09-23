import { definePlugin } from "@reelvault/sdk/plugin";
import { config } from "./config";
import { createOmdbProvider } from "./src/provider";

export default definePlugin(config, {
	async setup(host) {
		await host.providers.register(createOmdbProvider(host.config));
		host.logger.info("OMDb metadata plugin initialized");
	},
});
