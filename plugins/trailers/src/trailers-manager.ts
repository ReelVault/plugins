import type { PluginHost } from "@reelvault/sdk/plugin";
import type { TrailersConfig } from "../config";
import type { TrailerInfo, TrailersStats } from "../types";
import { TmdbTrailersClient } from "./tmdb-trailers.client";

const INDEX_KEY = "trailers_index";
const STATS_KEY = "trailers_stats";

function toStorageKey(prefix: string, rawKey: string): string {
	const sanitized = rawKey
		.trim()
		.toLowerCase()
		.replace(/[^A-Za-z0-9._-]/g, "_");
	return `${prefix}_${sanitized}`.slice(0, 100);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
	return Array.isArray(value) && value.every((item: unknown) => typeof item === "string");
}

function isTrailerInfo(value: unknown): value is TrailerInfo {
	return isRecord(value) && typeof value.trailerKey === "string" && (value.mediaType === "movie" || value.mediaType === "tv_show");
}

function isStatsMeta(value: unknown): value is { lastSyncAt?: string } {
	return isRecord(value) && (value.lastSyncAt === undefined || typeof value.lastSyncAt === "string");
}

function firstNonEmpty(...values: Array<string | undefined>): string {
	return values.find((value) => value !== undefined && value !== "") ?? "";
}

interface TrailerQueryOptions {
	tmdbId?: number | undefined;
	title?: string | undefined;
	mediaType?: "movie" | "tv_show" | undefined;
	year?: number | undefined;
}

interface ResolvedTrailerContext {
	title: string | undefined;
	mediaType: "movie" | "tv_show";
	tmdbId: number | undefined;
	year: number | undefined;
}

export class TrailersManager {
	private readonly host: PluginHost;
	private readonly tmdbClient: TmdbTrailersClient;

	constructor(host: PluginHost, config: TrailersConfig) {
		this.host = host;
		this.tmdbClient = new TmdbTrailersClient(config.apiKey, config.preferredLanguage);
	}

	/**
	 * Retrieves or discovers a trailer for the given metadata item or title/tmdbId.
	 */
	async getTrailer(metadataId?: string, options?: TrailerQueryOptions): Promise<TrailerInfo | null> {
		// 1. Resolve metadata from host if metadataId provided
		const context = await this.resolveContext(metadataId, options);
		if (!(context.title || context.tmdbId || metadataId)) {
			return null;
		}

		// 2. Check persistent storage cache
		const cacheKey = this.buildCacheKey(metadataId, context.tmdbId, context.title);
		const storedCache = await this.host.storage.get(cacheKey);
		const cached = isTrailerInfo(storedCache) ? storedCache : null;
		if (cached) {
			return cached;
		}

		// 3. Search TMDB if ID is missing
		const trailer = await this.discoverTrailer(context, metadataId, cacheKey);
		return trailer;
	}

	private async discoverTrailer(
		context: ResolvedTrailerContext,
		metadataId: string | undefined,
		cacheKey: string,
	): Promise<TrailerInfo | null> {
		let tmdbId = context.tmdbId;
		let mediaType = context.mediaType;

		if (!tmdbId && context.title) {
			const searchResult = await this.tmdbClient.searchTmdbId(context.title, mediaType, context.year);
			if (searchResult) {
				tmdbId = searchResult.id;
				mediaType = searchResult.mediaType;
			}
		}

		if (!tmdbId) {
			return null;
		}

		// 4. Fetch trailer video from TMDB
		const trailerResult = await this.tmdbClient.fetchTrailer(tmdbId, mediaType);
		if (!trailerResult) {
			return null;
		}

		const trailerInfo: TrailerInfo = {
			metadataId: metadataId ?? String(tmdbId),
			title: firstNonEmpty(context.title, trailerResult.name, "Zwiastun"),
			mediaType,
			trailerKey: trailerResult.key,
			trailerUrl: `https://www.youtube-nocookie.com/embed/${trailerResult.key}?autoplay=1&rel=0&modestbranding=1`,
			site: "YouTube",
			name: trailerResult.name,
			official: trailerResult.official,
			language: trailerResult.language,
			cachedAt: new Date().toISOString(),
		};

		// 5. Store in persistent storage
		await this.host.storage.set(cacheKey, trailerInfo);
		if (metadataId) {
			await this.addToIndex(metadataId);
		}

		return trailerInfo;
	}

	private async resolveContext(metadataId: string | undefined, options?: TrailerQueryOptions): Promise<ResolvedTrailerContext> {
		let title = options?.title?.trim();
		let mediaType: "movie" | "tv_show" = options?.mediaType === "tv_show" ? "tv_show" : "movie";
		let tmdbId = options?.tmdbId;
		let year = options?.year;

		if (metadataId) {
			try {
				const metadata = await this.host.metadata.get(metadataId);
				if (metadata) {
					title = metadata.title || title;
					mediaType = metadata.type === "tv_show" ? "tv_show" : "movie";
					if (metadata.releaseDate) {
						const parsedYear = new Date(metadata.releaseDate).getFullYear();
						if (!Number.isNaN(parsedYear)) year = parsedYear;
					}
					if (!tmdbId) {
						const tmdbExt = metadata.externalIds.find((e) => e.providerId === "tmdb");
						if (tmdbExt?.externalId) {
							const parsed = Number(tmdbExt.externalId);
							if (!Number.isNaN(parsed)) tmdbId = parsed;
						}
					}
				}
			} catch (err) {
				this.host.logger.warn("Failed to query host.metadata.get for trailer discovery", {
					metadataId,
					err: err instanceof Error ? err.message : String(err),
				});
			}
		}

		return { title, mediaType, tmdbId, year };
	}

	private buildCacheKey(metadataId: string | undefined, tmdbId: number | undefined, title: string | undefined): string {
		if (metadataId) return toStorageKey("trailer_meta", metadataId);
		if (tmdbId) return toStorageKey("trailer_tmdb", String(tmdbId));
		return toStorageKey("trailer_title", title ?? "");
	}

	/**
	 * Returns statistics of cached trailers.
	 */
	async getStats(): Promise<TrailersStats> {
		const storedIndex = await this.host.storage.get(INDEX_KEY);
		const index = isStringArray(storedIndex) ? storedIndex : [];
		let moviesCount = 0;
		let showsCount = 0;

		for (const id of index) {
			const storedItem = await this.host.storage.get(toStorageKey("trailer_meta", id));
			const item = isTrailerInfo(storedItem) ? storedItem : null;
			if (item) {
				if (item.mediaType === "movie") moviesCount++;
				else showsCount++;
			}
		}

		const storedStats = await this.host.storage.get(STATS_KEY);
		const statsMeta = isStatsMeta(storedStats) ? storedStats : undefined;

		return {
			cachedCount: index.length,
			moviesCount,
			showsCount,
			lastSyncAt: statsMeta?.lastSyncAt,
		};
	}

	/**
	 * Pre-fetches and caches trailers for given metadata items or known IDs.
	 */
	async bulkCache(
		items?: Array<{ id: string; title?: string; type?: "movie" | "tv_show"; tmdbId?: number }>,
	): Promise<{ processed: number; discovered: number }> {
		let processed = 0;
		let discovered = 0;

		const targetItems = items ?? [];
		for (const item of targetItems) {
			if (!item.id) continue;
			processed++;

			const storedExisting = await this.host.storage.get(toStorageKey("trailer_meta", item.id));
			const existing = isTrailerInfo(storedExisting) ? storedExisting : null;
			if (existing) {
				continue;
			}

			const trailer = await this.getTrailer(item.id, {
				title: item.title,
				mediaType: item.type === "tv_show" ? "tv_show" : "movie",
				tmdbId: item.tmdbId,
			});

			if (trailer) {
				discovered++;
			}

			// Small delay to respect rate limits
			await new Promise((resolve) => {
				setTimeout(resolve, 100);
			});
		}

		await this.host.storage.set(STATS_KEY, { lastSyncAt: new Date().toISOString() });

		return { processed, discovered };
	}

	private async addToIndex(metadataId: string): Promise<void> {
		const storedIndex = await this.host.storage.get(INDEX_KEY);
		const index = isStringArray(storedIndex) ? storedIndex : [];
		if (!index.includes(metadataId)) {
			index.push(metadataId);
			await this.host.storage.set(INDEX_KEY, index);
		}
	}
}
