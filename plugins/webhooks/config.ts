import { defineConfig, field, type InferConfig } from "@reelvault/sdk/plugin";

export const config = defineConfig({
	discordWebhookUrl: field.secret({
		label: "Discord webhook URL",
		description: "Discord channel webhook URL.",
		default: "",
	}),
	discordEnabled: field.boolean({ label: "Discord enabled", default: true }),
	telegramBotToken: field.secret({ label: "Telegram bot token", default: "" }),
	telegramChatId: field.string({ label: "Telegram chat ID", default: "" }),
	telegramEnabled: field.boolean({ label: "Telegram enabled", default: true }),
	genericWebhookUrl: field.secret({ label: "Generic webhook URL", default: "" }),
	genericEnabled: field.boolean({ label: "Generic webhook enabled", default: true }),
	serverPublicUrl: field.string({
		label: "Server public URL",
		description: "Server link appended to outgoing notifications.",
		default: "",
	}),
	onMediaReady: field.boolean({ label: "Notify on new media", default: true }),
	onPlaybackStarted: field.boolean({ label: "Notify on playback start", default: false }),
	onPlaybackStopped: field.boolean({ label: "Notify on playback stop", default: false }),
});

export type WebhooksConfig = InferConfig<typeof config>;
