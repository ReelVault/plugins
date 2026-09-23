import type { MetadataAvailability, PluginHost } from "reelvault-sdk/plugin";
import type { MediaAvailabilityState, MediaRequest, MediaRequestType } from "../types";
import type { RequestsManager } from "./requests-manager";

export interface ItemAvailability {
	state: MediaAvailabilityState;
	requestId?: string;
	metadataId?: string;
}

export interface AvailabilityInput {
	externalId: string;
	title: string;
	releaseDate?: string;
}

/**
 * Resolves whether a discoverable title is already in the library or already
 * requested. Library presence is one batched lookup per provider; request state
 * comes from the plugin's own storage (matched by external id, then title/year
 * for legacy title-only requests).
 */
export class AvailabilityService {
	private readonly host: PluginHost;
	private readonly manager: RequestsManager;

	constructor(host: PluginHost, manager: RequestsManager) {
		this.host = host;
		this.manager = manager;
	}

	async resolve(
		providerId: string,
		mediaType: MediaRequestType,
		items: readonly AvailabilityInput[],
	): Promise<Map<string, ItemAvailability>> {
		const externalIds = [...new Set(items.map((item) => item.externalId).filter((id) => id.length > 0))];
		const library = new Map<string, MetadataAvailability>();

		if (externalIds.length > 0) {
			try {
				const rows = await this.host.metadata.findManyByExternalIds(providerId, externalIds, mediaType);
				for (const row of rows) library.set(row.externalId, row);
			} catch (error) {
				this.host.logger.warn("Library availability lookup failed", { providerId, error });
			}
		}

		const requests = await this.manager.getAllRequests();
		const byExternal = new Map<string, MediaRequest>();
		const byTitle = new Map<string, MediaRequest>();
		for (const request of requests) {
			const externalKey = this.externalKey(request.providerId, request.externalId ?? request.tmdbId ?? request.imdbId);
			if (externalKey) byExternal.set(externalKey, request);
			byTitle.set(this.titleKey(request.mediaType, request.title, request.year), request);
		}

		const result = new Map<string, ItemAvailability>();
		for (const item of items) {
			const libraryMatch = library.get(item.externalId);
			if (libraryMatch?.hasFiles) {
				result.set(item.externalId, { state: "available", metadataId: libraryMatch.metadataId });
				continue;
			}

			const externalKey = this.externalKey(providerId, item.externalId);
			const year = item.releaseDate ? Number(item.releaseDate.slice(0, 4)) : undefined;
			const request = (externalKey ? byExternal.get(externalKey) : undefined) ?? byTitle.get(this.titleKey(mediaType, item.title, year));
			result.set(item.externalId, {
				state: request ? request.status : "none",
				requestId: request?.id,
				metadataId: libraryMatch?.metadataId,
			});
		}

		return result;
	}

	private externalKey(providerId?: string, externalId?: string): string | undefined {
		if (!externalId) return undefined;
		return `${providerId ?? "tmdb"}:${externalId}`;
	}

	private titleKey(mediaType: MediaRequestType, title: string, year?: number): string {
		return `${mediaType}:${title.trim().toLowerCase()}:${year ?? ""}`;
	}
}
