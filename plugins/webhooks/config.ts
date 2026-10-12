import { defineConfig, field, type InferConfig } from "@reelvault/sdk/plugin";

export const config = defineConfig({
	discordWebhookUrl: field.secret({
		label: { en: "Discord webhook URL", pl: "Adres webhooka Discord" },
		description: { en: "Discord channel webhook URL.", pl: "Adres webhooka kanału Discord." },
		default: "",
	}),
	discordEnabled: field.boolean({ label: { en: "Discord enabled", pl: "Discord włączony" }, default: true }),
	telegramBotToken: field.secret({ label: { en: "Telegram bot token", pl: "Token bota Telegram" }, default: "" }),
	telegramChatId: field.string({ label: { en: "Telegram chat ID", pl: "ID czatu Telegram" }, default: "" }),
	telegramEnabled: field.boolean({ label: { en: "Telegram enabled", pl: "Telegram włączony" }, default: true }),
	genericWebhookUrl: field.secret({ label: { en: "Generic webhook URL", pl: "Adres ogólnego webhooka" }, default: "" }),
	genericEnabled: field.boolean({ label: { en: "Generic webhook enabled", pl: "Ogólny webhook włączony" }, default: true }),
	serverPublicUrl: field.string({
		label: { en: "Server public URL", pl: "Publiczny adres serwera" },
		description: {
			en: "Server link appended to outgoing notifications.",
			pl: "Link do serwera dołączany do wysyłanych powiadomień.",
		},
		default: "",
	}),
	onMediaReady: field.boolean({ label: { en: "Notify on new media", pl: "Powiadamiaj o nowych mediach" }, default: true }),
	onPlaybackStarted: field.boolean({
		label: { en: "Notify on playback start", pl: "Powiadamiaj o rozpoczęciu odtwarzania" },
		default: false,
	}),
	onPlaybackStopped: field.boolean({
		label: { en: "Notify on playback stop", pl: "Powiadamiaj o zatrzymaniu odtwarzania" },
		default: false,
	}),
});

export type WebhooksConfig = InferConfig<typeof config>;
