import type { PluginHost } from "@reelvault/sdk/plugin";
import type { WebhooksConfig } from "../config";
import type { WebhookDeliveryLog, WebhookEventName, WebhooksStatusResponse, WebhookTarget, WebhookTestResult } from "../types";

const LOG_KEY = "delivery_log";
const MAX_LOG_ENTRIES = 100;

interface DeliveryResult {
	success: boolean;
	statusCode?: number;
	error?: string;
}

interface WebhookPayload {
	event: WebhookEventName;
	title: string;
	details?: string;
	timestamp: string;
}

/** Sends event notifications to Discord / Telegram / a generic JSON endpoint. */
export class WebhookManager {
	private readonly host: PluginHost;
	private readonly config: WebhooksConfig;

	constructor(host: PluginHost, config: WebhooksConfig) {
		this.host = host;
		this.config = config;
	}

	async getStatus(): Promise<WebhooksStatusResponse> {
		const log = await this.getLog();
		const successful = log.filter((entry) => entry.success).length;
		const last = log[0];
		return {
			enabled: this.activeTargets().length > 0,
			version: "1.0.0",
			config: {
				discordConfigured: Boolean(this.config.discordWebhookUrl),
				discordEnabled: this.config.discordEnabled,
				telegramConfigured: Boolean(this.config.telegramBotToken && this.config.telegramChatId),
				telegramEnabled: this.config.telegramEnabled,
				genericConfigured: Boolean(this.config.genericWebhookUrl),
				genericEnabled: this.config.genericEnabled,
				events: {
					onMediaReady: this.config.onMediaReady,
					onPlaybackStarted: this.config.onPlaybackStarted,
					onPlaybackStopped: this.config.onPlaybackStopped,
				},
				...(this.config.serverPublicUrl ? { serverPublicUrl: this.config.serverPublicUrl } : {}),
			},
			statistics: {
				totalDeliveries: log.length,
				successfulDeliveries: successful,
				failedDeliveries: log.length - successful,
				...(last ? { lastDeliveryAt: last.timestamp } : {}),
			},
		};
	}

	async getHistory(): Promise<{ history: WebhookDeliveryLog[] }> {
		return { history: await this.getLog() };
	}

	async clearHistory(): Promise<{ success: boolean; message: string }> {
		await this.host.storage.set(LOG_KEY, []);
		return { success: true, message: "Delivery history cleared." };
	}

	async sendTest(): Promise<WebhookTestResult> {
		const targets = this.activeTargets();
		if (targets.length === 0) {
			return { success: false, message: "No webhook targets are configured and enabled." };
		}

		const results: WebhookTestResult["results"] = {};
		let succeeded = 0;
		for (const target of targets) {
			const result = await this.deliver(target, "test", "ReelVault test notification", "This is a test message from the Webhooks plugin.");
			results[target] = { success: result.success, ...(result.error ? { error: result.error } : {}) };
			if (result.success) succeeded++;
		}

		return { success: succeeded > 0, message: `Delivered to ${succeeded}/${targets.length} targets.`, results };
	}

	async notifyMediaReady(metadataId: string, mediaFileId: string): Promise<void> {
		let title = "New media available";
		try {
			const metadata = await this.host.metadata.get(metadataId);
			if (metadata?.title) title = metadata.title;
		} catch {
			// Metadata lookup is best-effort — never block a notification.
		}
		await this.broadcast("media.ready", title, `${metadataId} · ${mediaFileId}`);
	}

	async notifyPlaybackStarted(mediaFileId: string): Promise<void> {
		await this.broadcast("playback.started", "Playback started", mediaFileId);
	}

	async notifyPlaybackStopped(mediaFileId: string): Promise<void> {
		await this.broadcast("playback.stopped", "Playback stopped", mediaFileId);
	}

	private async broadcast(event: WebhookEventName, title: string, details: string): Promise<void> {
		for (const target of this.activeTargets()) await this.deliver(target, event, title, details);
	}

	private activeTargets(): WebhookTarget[] {
		const targets: WebhookTarget[] = [];
		if (this.config.discordEnabled && this.config.discordWebhookUrl) targets.push("discord");
		if (this.config.telegramEnabled && this.config.telegramBotToken && this.config.telegramChatId) targets.push("telegram");
		if (this.config.genericEnabled && this.config.genericWebhookUrl) targets.push("generic");
		return targets;
	}

	private async deliver(target: WebhookTarget, event: WebhookEventName, title: string, details: string): Promise<DeliveryResult> {
		const timestamp = new Date().toISOString();
		const result = await this.send(target, { event, title, details, timestamp });
		await this.appendLog({
			id: crypto.randomUUID(),
			timestamp,
			target,
			event,
			success: result.success,
			title,
			details,
			...(result.statusCode !== undefined ? { statusCode: result.statusCode } : {}),
			...(result.error ? { error: result.error } : {}),
		});
		return result;
	}

	private async send(target: WebhookTarget, payload: WebhookPayload): Promise<DeliveryResult> {
		const text = `${payload.title}${payload.details ? `\n${payload.details}` : ""}`;
		const init: RequestInit = {
			method: "POST",
			headers: { "content-type": "application/json" },
			signal: AbortSignal.timeout(10_000),
		};

		try {
			if (target === "telegram") {
				const url = `https://api.telegram.org/bot${this.config.telegramBotToken}/sendMessage`;
				const response = await this.host.http.fetch(url, {
					...init,
					body: JSON.stringify({ chat_id: this.config.telegramChatId, text, disable_web_page_preview: true }),
				});
				return this.toResult(response.status, await response.text());
			}

			if (target === "discord") {
				const response = await this.host.http.fetch(this.config.discordWebhookUrl, {
					...init,
					body: JSON.stringify({ content: `**${payload.title}**${payload.details ? `\n${payload.details}` : ""}` }),
				});
				return this.toResult(response.status, await response.text());
			}

			const response = await this.host.http.fetch(this.config.genericWebhookUrl, {
				...init,
				body: JSON.stringify({
					source: "reelvault",
					event: payload.event,
					title: payload.title,
					details: payload.details,
					timestamp: payload.timestamp,
					...(this.config.serverPublicUrl ? { server: this.config.serverPublicUrl } : {}),
				}),
			});
			return this.toResult(response.status, await response.text());
		} catch (error) {
			return { success: false, error: error instanceof Error ? error.message : String(error) };
		}
	}

	private toResult(status: number, body: string): DeliveryResult {
		if (status >= 200 && status < 300) return { success: true, statusCode: status };
		const excerpt = body.length > 200 ? `${body.slice(0, 200)}…` : body;
		return { success: false, statusCode: status, error: `HTTP ${status}${excerpt ? `: ${excerpt}` : ""}` };
	}

	private async getLog(): Promise<WebhookDeliveryLog[]> {
		const raw = await this.host.storage.get(LOG_KEY);
		if (!Array.isArray(raw)) return [];
		return raw.filter((entry) => isDeliveryLog(entry));
	}

	private async appendLog(entry: WebhookDeliveryLog): Promise<void> {
		// Atomic read-modify-write: the host serializes concurrent appends per key.
		await this.host.storage.update(LOG_KEY, (raw) => {
			const log = Array.isArray(raw) ? raw.filter((item) => isDeliveryLog(item)) : [];
			return [entry, ...log].slice(0, MAX_LOG_ENTRIES);
		});
	}
}

function isDeliveryLog(value: unknown): value is WebhookDeliveryLog {
	if (typeof value !== "object" || value === null) return false;
	if (!("id" in value) || typeof value.id !== "string") return false;
	if (!("timestamp" in value) || typeof value.timestamp !== "string") return false;
	if (!("title" in value) || typeof value.title !== "string") return false;
	return true;
}
