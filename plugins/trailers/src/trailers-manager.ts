import type { PluginFetch, PluginHost } from "@reelvault/sdk/plugin";
import type { TrailersConfig } from "../config";
import type { TrailerInfo, TrailersStats } from "../types";
import { TmdbTrailersClient } from "./tmdb-trailers.client";

const INDEX_KEY = "trailers_index";
const COUNTS_KEY = "trailers_counts";

/** How long a title without a trailer is remembered before TMDB is asked again. */
export const NO_TRAILER_TTL_MS = 24 * 60 * 60_000;

interface NoTrailerEntry {
	noTrailer: true;
	checkedAt: string;
}

/** Cached trailers per media type. Updated on every write, so the stats never scan the cache. */
export interface TrailerCounts {
	moviesCount: number;
	showsCount: number;
}

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

function isNoTrailerEntry(value: unknown): value is NoTrailerEntry {
	return isRecord(value) && value.noTrailer === true && typeof value.checkedAt === "string";
}

function isTrailerCounts(value: unknown): value is TrailerCounts {
	return isRecord(value) && typeof value.moviesCount === "number" && typeof value.showsCount === "number";
}

/** True while a remembered "no trailer" answer is younger than NO_TRAILER_TTL_MS. */
export function isFreshNoTrailerEntry(value: unknown, now = Date.now()): boolean {
	if (!isNoTrailerEntry(value)) return false;

	const checkedAt = Date.parse(value.checkedAt);
	return Number.isFinite(checkedAt) && now - checkedAt < NO_TRAILER_TTL_MS;
}

/** The counts with one more trailer of the given media type. */
export function countTrailer(counts: TrailerCounts, mediaType: TrailerInfo["mediaType"]): TrailerCounts {
	if (mediaType === "movie") return { ...counts, moviesCount: counts.moviesCount + 1 };
	return { ...counts, showsCount: counts.showsCount + 1 };
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
		// Outbound TMDB calls go through the host, so the domain allowlist and the SSRF guard apply.
		const fetcher: PluginFetch = (input, init) => host.http.fetch(input, init);
		this.tmdbClient = new TmdbTrailersClient(config.apiKey, config.preferredLanguage, fetcher);
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

		// A recent "no trailer" answer stands until it expires, so TMDB is not searched again for it.
		if (isFreshNoTrailerEntry(storedCache)) {
			return null;
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
			return await this.rememberNoTrailer(cacheKey);
		}

		// 4. Fetch trailer video from TMDB
		const trailerResult = await this.tmdbClient.fetchTrailer(tmdbId, mediaType);
		if (!trailerResult) {
			return await this.rememberNoTrailer(cacheKey);
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
			await this.addToIndex(metadataId, mediaType);
		}

		return trailerInfo;
	}

	/** Stores the "no trailer" answer with its time, so the lookup is skipped until the entry expires. */
	private async rememberNoTrailer(cacheKey: string): Promise<null> {
		const entry: NoTrailerEntry = { noTrailer: true, checkedAt: new Date().toISOString() };
		await this.host.storage.set(cacheKey, entry);

		return null;
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
		const index = await this.readIndex();
		const counts = await this.readCounts(index);

		return {
			cachedCount: index.length,
			moviesCount: counts.moviesCount,
			showsCount: counts.showsCount,
		};
	}

	private async readIndex(): Promise<string[]> {
		const storedIndex = await this.host.storage.get(INDEX_KEY);
		return isStringArray(storedIndex) ? storedIndex : [];
	}

	/**
	 * The stored counts. When they are missing (trailers cached before they existed), they are counted
	 * once from the cached records of the index and stored.
	 */
	private async readCounts(index: string[]): Promise<TrailerCounts> {
		const stored = await this.host.storage.get(COUNTS_KEY);
		if (isTrailerCounts(stored)) return stored;

		let counts: TrailerCounts = { moviesCount: 0, showsCount: 0 };
		for (const id of index) {
			const storedItem = await this.host.storage.get(toStorageKey("trailer_meta", id));
			const item = isTrailerInfo(storedItem) ? storedItem : null;
			if (item) counts = countTrailer(counts, item.mediaType);
		}
		await this.host.storage.set(COUNTS_KEY, counts);
		return counts;
	}

	private async addToIndex(metadataId: string, mediaType: TrailerInfo["mediaType"]): Promise<void> {
		const index = await this.readIndex();
		if (index.includes(metadataId)) return;

		// The counts are read before the new id is indexed, so a one-time count never includes it twice.
		const counts = await this.readCounts(index);
		index.push(metadataId);
		await this.host.storage.set(INDEX_KEY, index);
		await this.host.storage.set(COUNTS_KEY, countTrailer(counts, mediaType));
	}
}
