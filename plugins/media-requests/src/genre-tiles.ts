import type { GenreTile, MediaRequestType } from "../types";
import type { DiscoverService } from "./discover-service";

const CACHE_TTL_MS = 12 * 60 * 60 * 1000;

/**
 * Builds Jellyseerr-style genre tiles: for each genre a page-1 discover call
 * picks the first item that has a backdrop. The provider calls run once per
 * TTL per media type — afterwards the tiles are served from memory, and a
 * tile without a backdrop degrades to a gradient in the UI.
 */
export class GenreTilesService {
	private readonly discover: DiscoverService;
	private readonly cache = new Map<string, { at: number; tiles: GenreTile[] }>();

	constructor(discover: DiscoverService) {
		this.discover = discover;
	}

	async list(type: MediaRequestType, providerId?: string): Promise<GenreTile[]> {
		const key = `${providerId ?? "*"}:${type}`;
		const cached = this.cache.get(key);
		if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.tiles;

		const genres = await this.discover.genres(type, providerId);
		const tiles = await Promise.all(
			genres.map(async (genre): Promise<GenreTile> => {
				const page = await this.discover.discover({ type, category: "popular", page: 1, genreId: genre.id, providerId });
				const backdropPath = page.items.find((item) => item.backdropPath)?.backdropPath;
				return { id: genre.id, name: genre.name, mediaType: type, ...(backdropPath ? { backdropPath } : {}) };
			}),
		);

		this.cache.set(key, { at: Date.now(), tiles });
		return tiles;
	}
}
