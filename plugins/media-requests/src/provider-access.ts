import type {
	PluginHost,
	ProviderDiscoveryCategory,
	ProviderDiscoveryResult,
	ProviderMetadataResult,
	ProviderResultGenre,
	ProviderSearchResponse,
	ProviderSeasonResult,
	ProviderStatus,
} from "reelvault-sdk/plugin";
import type { MediaRequestType } from "../types";

export interface DiscoveryQuery {
	type: MediaRequestType;
	category: ProviderDiscoveryCategory;
	page: number;
	window?: "day" | "week";
	genreId?: string;
	year?: number;
	providerId?: string;
}

/**
 * Thin, failure-tolerant wrapper over the host's metadata-provider capability.
 * Every method degrades to an empty/null result so a missing or misbehaving
 * provider never breaks the requests UI — the plugin decides what to show.
 */
export class ProviderAccess {
	private readonly host: PluginHost;

	constructor(host: PluginHost) {
		this.host = host;
	}

	async list(): Promise<ProviderStatus[]> {
		try {
			return await this.host.providers.list();
		} catch (error) {
			this.host.logger.warn("Metadata provider list unavailable", { error });
			return [];
		}
	}

	async discover(query: DiscoveryQuery): Promise<ProviderDiscoveryResult | null> {
		try {
			return await this.host.providers.discover({
				type: query.type,
				category: query.category,
				page: query.page,
				window: query.window,
				genreId: query.genreId,
				year: query.year,
				providerId: query.providerId,
			});
		} catch (error) {
			this.host.logger.warn("Metadata discovery unavailable", { category: query.category, error });
			return null;
		}
	}

	async search(type: MediaRequestType, query: string, providerId?: string): Promise<ProviderSearchResponse[]> {
		try {
			return await this.host.providers.search({ type, query, providerId });
		} catch (error) {
			this.host.logger.warn("Metadata search unavailable", { type, error });
			return [];
		}
	}

	async getDetails(providerId: string, type: MediaRequestType, externalId: string): Promise<ProviderMetadataResult | null> {
		try {
			return await this.host.providers.getDetails(providerId, type, externalId);
		} catch (error) {
			this.host.logger.warn("Metadata details unavailable", { providerId, externalId, error });
			return null;
		}
	}

	async getSeasonDetails(providerId: string, externalId: string, seasonNumber: number): Promise<ProviderSeasonResult | null> {
		try {
			return await this.host.providers.getSeasonDetails(providerId, externalId, seasonNumber);
		} catch (error) {
			this.host.logger.warn("Provider season details unavailable", { providerId, externalId, seasonNumber, error });
			return null;
		}
	}

	async getGenres(type: MediaRequestType, providerId?: string): Promise<ProviderResultGenre[]> {
		try {
			return await this.host.providers.getGenres(type, providerId);
		} catch (error) {
			this.host.logger.warn("Metadata genres unavailable", { type, error });
			return [];
		}
	}
}
