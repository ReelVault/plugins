export type WebhookTarget = "discord" | "telegram" | "generic";

export type WebhookEventName = "media.ready" | "playback.started" | "playback.stopped" | "test";

export interface WebhookDeliveryLog {
	id: string;
	timestamp: string;
	target: WebhookTarget;
	event: WebhookEventName;
	success: boolean;
	statusCode?: number;
	error?: string;
	title: string;
	details?: string;
}

export interface WebhooksStatusResponse {
	enabled: boolean;
	version: string;
	config: {
		discordConfigured: boolean;
		discordEnabled: boolean;
		telegramConfigured: boolean;
		telegramEnabled: boolean;
		genericConfigured: boolean;
		genericEnabled: boolean;
		serverPublicUrl?: string;
		events: {
			onMediaReady: boolean;
			onPlaybackStarted: boolean;
			onPlaybackStopped: boolean;
		};
	};
	statistics: {
		totalDeliveries: number;
		successfulDeliveries: number;
		failedDeliveries: number;
		lastDeliveryAt?: string;
	};
}

export interface WebhookTestResult {
	success: boolean;
	message: string;
	results?: Partial<Record<WebhookTarget, { success: boolean; error?: string }>>;
}
