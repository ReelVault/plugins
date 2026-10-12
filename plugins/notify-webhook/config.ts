import { defineConfig, field, type InferConfig } from "@reelvault/sdk/plugin";

export const config = defineConfig({
	webhookUrl: field.secret({
		label: { en: "Webhook URL", pl: "Adres webhooka" },
		description: {
			en: "Every notification is POSTed as JSON to this URL.",
			pl: "Każde powiadomienie jest wysyłane metodą POST w formacie JSON na ten adres.",
		},
		default: "",
	}),
	authorizationHeader: field.secret({
		label: { en: "Authorization header", pl: "Nagłówek Authorization" },
		description: {
			en: "Optional value sent as the Authorization header (e.g. a bearer token).",
			pl: "Opcjonalna wartość wysyłana w nagłówku Authorization (np. token bearer).",
		},
		default: "",
	}),
	notifyNewEpisodes: field.boolean({ label: { en: "New episodes", pl: "Nowe odcinki" }, default: true }),
	notifySystem: field.boolean({
		label: { en: "System and plugin notifications", pl: "Powiadomienia systemowe i wtyczek" },
		description: {
			en: "Everything that is not a new-episode notification.",
			pl: "Wszystko, co nie jest powiadomieniem o nowym odcinku.",
		},
		default: true,
	}),
});

export type NotifyWebhookConfig = InferConfig<typeof config>;
