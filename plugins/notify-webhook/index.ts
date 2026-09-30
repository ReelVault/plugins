import type { OutgoingNotification } from "@reelvault/sdk/plugin";
import { definePlugin } from "@reelvault/sdk/plugin";
import { config } from "./config";

export default definePlugin(config, {
	setup(host) {
		host.notificationChannels.register({
			id: "notify-webhook",
			deliver: async (notification: OutgoingNotification) => {
				if (!host.config.webhookUrl) return;
				if (!host.config.notifyNewEpisodes && notification.type === "new_episode") return;
				if (!host.config.notifySystem && notification.type !== "new_episode") return;

				const response = await host.http.fetch(host.config.webhookUrl, {
					method: "POST",
					headers: {
						"content-type": "application/json",
						...(host.config.authorizationHeader ? { authorization: host.config.authorizationHeader } : {}),
					},
					body: JSON.stringify({
						id: notification.id,
						type: notification.type,
						title: notification.title,
						message: notification.message ?? null,
						link: notification.link ?? null,
						data: notification.data ?? {},
					}),
				});

				if (!response.ok) {
					host.logger.warn("Webhook delivery rejected", { status: response.status, type: notification.type });
				}
			},
		});

		host.logger.info("Notify Webhook plugin initialized");
	},
});
