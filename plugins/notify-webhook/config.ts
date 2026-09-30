import { defineConfig, field, type InferConfig } from "@reelvault/sdk/plugin";

export const config = defineConfig({
	webhookUrl: field.secret({
		label: "Webhook URL",
		description: "Every notification is POSTed as JSON to this URL.",
		default: "",
	}),
	authorizationHeader: field.secret({
		label: "Authorization header",
		description: "Optional value sent as the Authorization header (e.g. a bearer token).",
		default: "",
	}),
	notifyNewEpisodes: field.boolean({ label: "New episodes", default: true }),
	notifySystem: field.boolean({
		label: "System and plugin notifications",
		description: "Everything that is not a new-episode notification.",
		default: true,
	}),
});

export type NotifyWebhookConfig = InferConfig<typeof config>;
