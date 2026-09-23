import type { ProviderSearchResult } from "@reelvault/sdk/plugin";
import type { DiscoverPage, MediaCard, MediaDetails, MediaGenre, MediaRequestType, MediaSearchResults, MediaSeasonDetails } from "../types";
import type { AvailabilityService, ItemAvailability } from "./availability";
import type { DiscoveryQuery, ProviderAccess } from "./provider-access";

function releaseYear(releaseDate?: string): number | undefined {
	if (!releaseDate) return undefined;
	const year = Number(releaseDate.slice(0, 4));
	return Number.isFinite(year) && year > 0 ? year : undefined;
}

const TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p";
const ABSOLUTE_URL = /^https?:\/\//i;
const TMDB_ORIGINAL_SEGMENT = "/t/p/original/";

/**
 * Expands a provider-native poster path to a full CDN URL (the same rules as
 * the plugin UI's imageUrl helper) so hosts without provider-path context —
 * e.g. the app's global search — can render miniatures directly.
 */
function posterImageUrl(path?: string, size = "w185"): string | undefined {
	if (!path) return undefined;
	if (ABSOLUTE_URL.test(path)) {
		return path.includes(TMDB_ORIGINAL_SEGMENT) ? path.replace(TMDB_ORIGINAL_SEGMENT, `/t/p/${size}/`) : path;
	}
	if (path.startsWith("/")) return `${TMDB_IMAGE_BASE}/${size}${path}`;
	return undefined;
}

/** Composes provider discovery/search/details with the plugin's availability state. */
export class DiscoverService {
	private readonly providers: ProviderAccess;
	private readonly availability: AvailabilityService;

	constructor(providers: ProviderAccess, availability: AvailabilityService) {
		this.providers = providers;
		this.availability = availability;
	}

	async discover(query: DiscoveryQuery): Promise<DiscoverPage> {
		const page = await this.providers.discover(query);
		if (!page) {
			return { page: query.page, totalPages: 0, totalResults: 0, items: [], unsupported: true };
		}

		const items = await this.toCards(page.providerId, query.type, page.items);
		return {
			providerId: page.providerId,
			page: page.page,
			totalPages: page.totalPages,
			totalResults: page.totalResults,
			items,
			unsupported: false,
		};
	}

	async genres(type: MediaRequestType, providerId?: string): Promise<MediaGenre[]> {
		const genres = await this.providers.getGenres(type, providerId);
		return genres.map((genre) => this.toGenre(genre.id, genre.name));
	}

	/** Resolves one season (with episodes) from the provider's own id namespace. */
	async seasonDetails(providerId: string, externalId: string, seasonNumber: number): Promise<MediaSeasonDetails | null> {
		const season = await this.providers.getSeasonDetails(providerId, externalId, seasonNumber);
		if (!season) return null;

		return {
			number: Number(season.seasonNumber),
			name: season.name,
			overview: season.overview,
			airDate: season.airDate,
			posterPath: season.posterPath,
			episodes: (season.episodes ?? []).map((episode) => ({
				number: Number(episode.episodeNumber),
				name: episode.name,
				overview: episode.overview,
				airDate: episode.airDate,
				thumbnailPath: episode.thumbnailPath,
			})),
		};
	}

	async search(type: MediaRequestType, query: string): Promise<MediaSearchResults> {
		const groups = await this.providers.search(type, query);
		const cards: MediaCard[] = [];
		const seen = new Set<string>();

		for (const group of groups) {
			const groupCards = await this.toCards(group.providerId, type, group.results);
			for (const card of groupCards) {
				if (seen.has(card.externalId)) continue;
				seen.add(card.externalId);
				cards.push(card);
			}
		}

		return { items: cards };
	}

	async details(providerId: string, type: MediaRequestType, externalId: string): Promise<MediaDetails | null> {
		const metadata = await this.providers.getDetails(providerId, type, externalId);
		if (!metadata) return null;

		const availability = await this.availability.resolve(providerId, type, [
			{ externalId, title: metadata.title, releaseDate: metadata.releaseDate },
		]);
		const info = availability.get(externalId);

		return {
			...this.baseCard(providerId, type, metadata, info),
			title: metadata.title,
			backdropPath: metadata.backdropPath,
			tagline: metadata.tagline,
			overview: metadata.overview,
			releaseDate: metadata.releaseDate,
			voteAverage: metadata.voteAverage,
			voteCount: metadata.voteCount,
			popularity: metadata.popularity,
			providerStatus: metadata.status,
			originalTitle: metadata.originalTitle,
			genres: (metadata.genres ?? []).map((genre) => this.toGenre(genre.id, genre.name)),
			cast: (metadata.cast ?? []).slice(0, 24).map((member) => ({
				id: member.id,
				name: member.name,
				character: member.character,
				profilePath: member.profilePath,
			})),
			crew: (metadata.crew ?? []).slice(0, 24).map((member) => ({
				id: member.id,
				name: member.name,
				job: member.job,
				department: member.department,
			})),
			seasons: (metadata.seasons ?? [])
				.filter((season) => Number(season.seasonNumber) !== 0 || (season.episodes?.length ?? 0) > 0)
				.map((season) => ({
					number: Number(season.seasonNumber),
					name: season.name ?? `Season ${season.seasonNumber}`,
					episodeCount: season.episodeCount ?? season.episodes?.length ?? 0,
					posterPath: season.posterPath,
					airDate: season.airDate,
				})),
			productionCompanies: (metadata.productionCompanies ?? []).map((company) => ({
				id: company.id,
				name: company.name,
			})),
			keywords: (metadata.keywords ?? []).map((keyword) => ({ id: keyword.id, name: keyword.name })),
			ratings: (metadata.ratings ?? []).map((rating) => ({
				source: rating.source,
				label: rating.label,
				value: rating.value,
				maxValue: rating.maxValue,
			})),
		};
	}

	private async toCards(providerId: string, type: MediaRequestType, items: readonly ProviderSearchResult[]): Promise<MediaCard[]> {
		const availability = await this.availability.resolve(
			providerId,
			type,
			items.map((item) => ({ externalId: item.externalId, title: item.title, releaseDate: item.releaseDate })),
		);
		return items.map((item) => this.baseCard(providerId, type, item, availability.get(item.externalId)));
	}

	private baseCard(
		providerId: string,
		type: MediaRequestType,
		item: Pick<
			ProviderSearchResult,
			"externalId" | "title" | "releaseDate" | "posterPath" | "backdropPath" | "overview" | "voteAverage" | "popularity"
		>,
		info: ItemAvailability | undefined,
	): MediaCard {
		return {
			providerId,
			externalId: item.externalId,
			mediaType: type,
			title: item.title,
			year: releaseYear(item.releaseDate),
			posterPath: item.posterPath,
			backdropPath: item.backdropPath,
			imageUrl: posterImageUrl(item.posterPath),
			overview: item.overview,
			voteAverage: item.voteAverage,
			popularity: item.popularity,
			state: info?.state ?? "none",
			requestId: info?.requestId,
			metadataId: info?.metadataId,
		};
	}

	private toGenre(id: string, name: string): MediaGenre {
		return { id, name };
	}
}
