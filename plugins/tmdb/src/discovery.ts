import type { Language } from "@lorenzopant/tmdb";
import type {
	ProviderDiscoveryPage,
	ProviderDiscoveryRequest,
	ProviderMediaType,
	ProviderResultGenre,
	ProviderSearchResult,
} from "reelvault-sdk/plugin";
import { type TMDBApi, toLanguage } from "./tmdb";

/** Minimal structural shape shared by every TMDB list/result item. */
interface TmdbListItem {
	id: number;
	title?: string;
	name?: string;
	original_title?: string;
	original_name?: string;
	original_language?: string;
	release_date?: string;
	first_air_date?: string;
	poster_path?: string | null;
	backdrop_path?: string | null;
	overview?: string;
	popularity?: number;
	vote_average?: number;
	vote_count?: number;
}

interface TmdbPage<T> {
	page: number;
	total_pages: number;
	total_results: number;
	results?: T[];
}

function toSearchResult(api: TMDBApi, item: TmdbListItem): ProviderSearchResult {
	return {
		externalId: item.id.toString(),
		title: item.title ?? item.name ?? "",
		originalTitle: item.original_title ?? item.original_name,
		originalLanguage: item.original_language,
		releaseDate: item.release_date ?? item.first_air_date ?? "",
		posterPath: api.getImagePath(item.poster_path),
		backdropPath: api.getImagePath(item.backdrop_path),
		overview: item.overview,
		popularity: item.popularity,
		voteAverage: item.vote_average,
		voteCount: item.vote_count,
	};
}

function mapPage<TItem extends TmdbListItem>(api: TMDBApi, response: TmdbPage<TItem>): ProviderDiscoveryPage {
	return {
		page: response.page,
		totalPages: response.total_pages,
		totalResults: response.total_results,
		items: (response.results ?? []).map((item) => toSearchResult(api, item)),
	};
}

function emptyPage(page: number): ProviderDiscoveryPage {
	return { items: [], page, totalPages: 0, totalResults: 0 };
}

async function fetchRecommendations(
	api: TMDBApi,
	request: ProviderDiscoveryRequest,
	language: Language,
	page: number,
): Promise<ProviderDiscoveryPage> {
	const numericId = request.externalId ? Number(request.externalId) : Number.NaN;
	if (!Number.isFinite(numericId)) return emptyPage(page);

	const client = api.client;
	const isRecommendations = request.category === "recommendations";

	if (request.type === "tv_show") {
		const params = { series_id: numericId, page, language };
		const response = isRecommendations ? await client.tv_series.recommendations(params) : await client.tv_series.similar(params);
		return mapPage(api, response);
	}

	const params = { movie_id: numericId, page, language };
	const response = isRecommendations ? await client.movies.recommendations(params) : await client.movies.similar(params);
	return mapPage(api, response);
}

async function fetchDiscover(
	api: TMDBApi,
	request: ProviderDiscoveryRequest,
	language: Language,
	page: number,
): Promise<ProviderDiscoveryPage> {
	const client = api.client;
	const genreFilter = request.genreId ? { with_genres: request.genreId } : {};

	if (request.type === "tv_show") {
		return mapPage(
			api,
			await client.discover.tv({
				page,
				language,
				...genreFilter,
				...(request.year ? { first_air_date_year: request.year } : {}),
				sort_by: "popularity.desc",
			}),
		);
	}

	return mapPage(
		api,
		await client.discover.movie({
			page,
			language,
			...genreFilter,
			...(request.year ? { primary_release_year: request.year } : {}),
			sort_by: "popularity.desc",
		}),
	);
}

async function fetchCategory(
	api: TMDBApi,
	request: ProviderDiscoveryRequest,
	language: Language,
	page: number,
): Promise<ProviderDiscoveryPage> {
	const client = api.client;
	const isTv = request.type === "tv_show";

	switch (request.category) {
		case "trending": {
			const params = { time_window: request.window ?? "week", page, language };
			return isTv ? mapPage(api, await client.trending.tv(params)) : mapPage(api, await client.trending.movies(params));
		}
		case "popular":
			return isTv
				? mapPage(api, await client.tv_lists.popular({ page, language }))
				: mapPage(api, await client.movie_lists.popular({ page, language }));
		case "top_rated":
			return isTv
				? mapPage(api, await client.tv_lists.top_rated({ page, language }))
				: mapPage(api, await client.movie_lists.top_rated({ page, language }));
		case "now_playing":
			return isTv
				? mapPage(api, await client.tv_lists.on_the_air({ page, language }))
				: mapPage(api, await client.movie_lists.now_playing({ page, language }));
		case "upcoming":
			return isTv
				? mapPage(api, await client.tv_lists.airing_today({ page, language }))
				: mapPage(api, await client.movie_lists.upcoming({ page, language }));
		case "recommendations":
		case "similar":
			return emptyPage(page);
		default:
			return emptyPage(page);
	}
}

/**
 * Maps the provider-agnostic discovery categories onto TMDB endpoints. Filtered
 * requests (genre/year) route through `discover`; `recommendations`/`similar`
 * require `externalId`, and movie-only categories degrade to the closest TV
 * equivalent (`now_playing` → `on_the_air`, `upcoming` → `airing_today`).
 */
export function discoverTmdb(api: TMDBApi, request: ProviderDiscoveryRequest): Promise<ProviderDiscoveryPage> {
	const language = toLanguage(request.language ?? api.language);
	const page = request.page && request.page > 0 ? request.page : 1;

	if (request.category === "recommendations" || request.category === "similar") {
		return fetchRecommendations(api, request, language, page);
	}

	if (request.genreId || request.year) {
		return fetchDiscover(api, request, language, page);
	}

	return fetchCategory(api, request, language, page);
}

/** TMDB genre catalogue for a media type, mapped to provider-agnostic genres. */
export async function getTmdbGenres(api: TMDBApi, type: ProviderMediaType): Promise<ProviderResultGenre[]> {
	const language = toLanguage(api.language);
	const response = type === "tv_show" ? await api.client.genres.tv_list({ language }) : await api.client.genres.movie_list({ language });
	return response.genres.map((genre) => ({ id: genre.id.toString(), name: genre.name }));
}
