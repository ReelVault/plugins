import type { PluginHost, ProviderSearchResult } from "reelvault-sdk/plugin";
import type { CinemamodeConfig } from "../config";
import type { PreRollCacheEntry, PreRollEntry, PreRollResponse } from "../types";
import { TmdbClient } from "./tmdb.client";

const CACHE_PREFIX = "pre_roll_";
/** Cached selections stay valid for half a day — trailers rarely change. */
const CACHE_TTL_MS = 12 * 60 * 60 * 1000;
/** How many discovery pages to merge per category before intersecting with the library. */
const DISCOVERY_PAGES = 2;

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPreRollCacheEntry(value: unknown): value is PreRollCacheEntry {
	return isRecord(value) && typeof value.cachedAt === "string" && Array.isArray(value.entries);
}

function shuffle<T>(items: T[]): T[] {
	const copy = [...items];
	for (let i = copy.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		const current = copy[i];
		const swap = copy[j];
		if (current === undefined || swap === undefined) continue;
		copy[i] = swap;
		copy[j] = current;
	}
	return copy;
}

interface Candidate {
	externalId: string;
	title: string;
	imageUrl?: string | undefined;
}

/**
 * Builds the pre-play trailer queue for one title: similar/recommended titles
 * from the provider intersected with the library, each resolved to its best
 * YouTube trailer. Results are cached per source title to keep play start fast.
 */
export class PreRollManager {
	private readonly host: PluginHost;
	private readonly config: CinemamodeConfig;
	private readonly tmdb: TmdbClient;

	constructor(host: PluginHost, config: CinemamodeConfig) {
		this.host = host;
		this.config = config;
		this.tmdb = new TmdbClient(config.tmdbApiKey, config.language);
	}

	async getPreRoll(mediaFileId: string): Promise<PreRollResponse> {
		if (!this.config.enabled) return { entries: [] };

		const cached = await this.readCache(mediaFileId);
		if (cached) return { entries: cached };

		const source = await this.resolveSource(mediaFileId);
		if (!source) return { entries: [] };

		const cacheKey = `${CACHE_PREFIX}${mediaFileId}`;
		const entries = await this.buildEntries(source);
		await this.host.storage.set(cacheKey, { cachedAt: new Date().toISOString(), entries });
		return { entries };
	}

	private async readCache(mediaFileId: string): Promise<PreRollEntry[] | null> {
		try {
			const stored = await this.host.storage.get(`${CACHE_PREFIX}${mediaFileId}`);
			if (!isPreRollCacheEntry(stored)) return null;
			const age = Date.now() - new Date(stored.cachedAt).getTime();
			if (Number.isNaN(age) || age > CACHE_TTL_MS) return null;
			return stored.entries;
		} catch (error) {
			this.host.logger.warn("Pre-roll cache read failed — rebuilding", {
				mediaFileId,
				error: error instanceof Error ? error.message : String(error),
			});
			return null;
		}
	}

	private async resolveSource(
		mediaFileId: string,
	): Promise<{ type: "movie" | "tv_show"; tmdbId: string; tmdbExternalId: string; title: string } | null> {
		const media = await this.host.media.get(mediaFileId);
		if (!media) return null;

		const metadata = await this.host.metadata.get(media.metadataId);
		if (!metadata) return null;

		const tmdb = metadata.externalIds.find((id) => id.providerId === "tmdb");
		if (!tmdb) return null;

		return {
			type: metadata.type === "tv_show" ? "tv_show" : "movie",
			tmdbId: tmdb.externalId,
			tmdbExternalId: tmdb.externalId,
			title: metadata.title,
		};
	}

	private async buildEntries(source: {
		type: "movie" | "tv_show";
		tmdbId: string;
		tmdbExternalId: string;
		title: string;
	}): Promise<PreRollEntry[]> {
		const candidates = await this.collectCandidates(source);
		if (candidates.length === 0) return [];

		const picked = shuffle(candidates).slice(0, this.config.trailerCount);
		const entries: PreRollEntry[] = [];
		for (const candidate of picked) {
			const trailer = await this.tmdb.fetchTrailer(Number(candidate.externalId), source.type);
			if (!trailer) continue;
			entries.push({
				kind: "youtube",
				key: trailer.key,
				title: candidate.title,
				trailerName: trailer.name,
				imageUrl: candidate.imageUrl,
				metadataId: candidate.metadataId,
			});
		}
		return entries;
	}

	private async collectCandidates(source: {
		type: "movie" | "tv_show";
		tmdbId: string;
		tmdbExternalId: string;
		title: string;
	}): Promise<Array<Candidate & { metadataId: string | undefined }>> {
		const merged = new Map<string, Candidate>();
		for (const category of ["recommendations", "similar"] as const) {
			for (let page = 1; page <= DISCOVERY_PAGES; page++) {
				try {
					const result = await this.host.providers.discover({
						type: source.type,
						category,
						externalId: source.tmdbExternalId,
						providerId: "tmdb",
						page,
					});
					if (!result) break;
					for (const item of result.items) this.addCandidate(merged, item, source);
					if (page >= result.totalPages) break;
				} catch (error) {
					this.host.logger.warn("Provider discovery failed for pre-roll", {
						category,
						page,
						error: error instanceof Error ? error.message : String(error),
					});
					break;
				}
			}
		}

		const candidates = [...merged.values()];
		if (candidates.length === 0) return [];

		// Intersect with the library in one batch — owned titles get priority and,
		// in libraryOnly mode, are the only ones eligible.
		const byExternalId = new Map(candidates.map((candidate) => [candidate.externalId, candidate]));
		let availability: Awaited<ReturnType<typeof this.host.metadata.findManyByExternalIds>> = [];
		try {
			availability = await this.host.metadata.findManyByExternalIds("tmdb", [...byExternalId.keys()], source.type);
		} catch (error) {
			this.host.logger.warn("Library lookup failed for pre-roll", {
				error: error instanceof Error ? error.message : String(error),
			});
		}

		const owned: Array<Candidate & { metadataId: string }> = [];
		for (const hit of availability) {
			const candidate = byExternalId.get(hit.externalId);
			if (candidate && hit.hasFiles) owned.push({ ...candidate, metadataId: hit.metadataId });
		}

		if (this.config.libraryOnly) return owned;

		const ownedIds = new Set(owned.map((candidate) => candidate.metadataId));
		const others = candidates
			.filter((candidate) => !ownedIds.has(candidate.externalId))
			.map((candidate) => ({ ...candidate, metadataId: undefined }));
		return [...owned, ...others];
	}

	private addCandidate(target: Map<string, Candidate>, item: ProviderSearchResult, source: { tmdbId: string; title: string }): void {
		if (!item.externalId || item.externalId === source.tmdbId) return;
		if (target.has(item.externalId)) return;
		target.set(item.externalId, {
			externalId: item.externalId,
			title: item.title,
			imageUrl: this.tmdb.imageUrl(item.backdropPath) ?? this.tmdb.imageUrl(item.posterPath, "w342"),
		});
	}
}
