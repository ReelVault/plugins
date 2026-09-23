import type {
	MetadataProvider,
	MetadataProviderContext,
	ProviderEpisodeResult,
	ProviderMetadataResult,
	ProviderSearchResult,
	ProviderSeasonResult,
} from "reelvault-sdk/plugin";
import type { TmdbConfig } from "../config";
import { discoverTmdb, getTmdbGenres } from "./discovery";
import { getDetailsEpisode } from "./routes/details-episode";
import { getDetailsMovie } from "./routes/details-movie";
import { getDetailsSeason } from "./routes/details-season";
import { getDetailsSeries } from "./routes/details-series";
import { searchMovie } from "./routes/search-movie";
import { searchSeries } from "./routes/search-series";
import { TMDBApi } from "./tmdb";

interface ProviderImageResult {
	type: "poster" | "backdrop";
	url: string;
	width?: number;
	height?: number;
	language?: string;
	score?: number;
}

export function createTmdbProvider(config: TmdbConfig): MetadataProvider {
	let api: TMDBApi | undefined;
	let logger: MetadataProviderContext["logger"] | undefined;

	const getApi = (): TMDBApi => {
		if (!api) throw new Error("TMDB provider has not been initialized");
		return api;
	};

	const provider: MetadataProvider = {
		id: "tmdb",
		name: "TMDB",
		version: "1.0.0",
		supportedTypes: ["movie", "tv_show"],

		initialize(context) {
			logger = context.logger;
			api = new TMDBApi(config.apiKey, config.language, config.searchLanguage, config.fallbackLanguage);
		},

		async search(type: "movie" | "tv_show", query: string, year?: number): Promise<ProviderSearchResult[]> {
			if (!query.trim()) return [];
			try {
				if (type === "tv_show") {
					return await searchSeries(getApi(), query, year);
				}

				return await searchMovie(getApi(), query, year);
			} catch (error) {
				logger?.error("TMDB search failed", error, { type, query, year });
				return [];
			}
		},

		async getDetails(type: "movie" | "tv_show", externalId: string): Promise<ProviderMetadataResult | null> {
			try {
				if (type === "tv_show") {
					return await getDetailsSeries(getApi(), externalId);
				}

				return await getDetailsMovie(getApi(), externalId);
			} catch (error) {
				logger?.error("TMDB metadata details failed", error, { type, externalId });
				return null;
			}
		},

		async getImages(type: "movie" | "tv_show", externalId: string): Promise<ProviderImageResult[]> {
			try {
				const id = Number(externalId);
				const imageLanguages: Array<"pl" | "en" | "null"> = ["pl", "en", "null"];
				const data =
					type === "movie"
						? await getApi().client.movies.images({ movie_id: id, include_image_language: imageLanguages })
						: await getApi().client.tv_series.images({ series_id: id, include_image_language: imageLanguages });
				return [
					...data.posters.flatMap((image) => {
						const url = getApi().getImagePath(image.file_path);
						return url
							? [
									{
										type: "poster" as const,
										url,
										width: image.width,
										height: image.height,
										language: image.iso_639_1,
										score: image.vote_average,
									},
								]
							: [];
					}),
					...data.backdrops.flatMap((image) => {
						const url = getApi().getImagePath(image.file_path);
						return url
							? [
									{
										type: "backdrop" as const,
										url,
										width: image.width,
										height: image.height,
										language: image.iso_639_1,
										score: image.vote_average,
									},
								]
							: [];
					}),
				];
			} catch (error) {
				logger?.error("TMDB artwork lookup failed", error, { type, externalId });
				return [];
			}
		},

		async getSeasonDetails(externalId: string, seasonNumber: number): Promise<ProviderSeasonResult | null> {
			try {
				return await getDetailsSeason(getApi(), externalId, seasonNumber);
			} catch (error) {
				logger?.error("TMDB season details failed", error, { externalId, seasonNumber });
				return null;
			}
		},

		async getEpisodeDetails(externalId: string, seasonNumber: number, episodeNumber: number): Promise<ProviderEpisodeResult | null> {
			try {
				return await getDetailsEpisode(getApi(), externalId, seasonNumber, episodeNumber);
			} catch (error) {
				logger?.error("TMDB episode details failed", error, { externalId, seasonNumber, episodeNumber });
				return null;
			}
		},

		async discover(request) {
			try {
				return await discoverTmdb(getApi(), request);
			} catch (error) {
				logger?.error("TMDB discovery failed", error, { type: request.type, category: request.category });
				return { items: [], page: request.page ?? 1, totalPages: 0, totalResults: 0 };
			}
		},

		async getGenres(type) {
			try {
				return await getTmdbGenres(getApi(), type);
			} catch (error) {
				logger?.error("TMDB genres lookup failed", error, { type });
				return [];
			}
		},

		test() {
			logger?.warn("TMDB test not implemented");
			return Promise.resolve(true);
		},

		dispose() {
			api = undefined;
			logger = undefined;
		},
	};
	return provider;
}
