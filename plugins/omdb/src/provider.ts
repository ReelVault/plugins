import type {
	ExternalIdentifiers,
	MetadataProvider,
	MetadataProviderContext,
	ProviderEpisodeResult,
	ProviderMetadataResult,
	ProviderSearchResult,
	ProviderSeasonResult,
} from "reelvault-sdk/plugin";
import type { OmdbConfig } from "../config";
import { isValidImdbId, OMDbApi } from "./omdb";
import { getDetails } from "./routes/details";
import { getEpisode } from "./routes/episode";
import { searchTitles } from "./routes/search";
import { getSeason } from "./routes/season";

export function createOmdbProvider(config: OmdbConfig): MetadataProvider {
	let api: OMDbApi | undefined;
	let logger: MetadataProviderContext["logger"] | undefined;

	const getApi = (): OMDbApi => {
		if (!api) throw new Error("OMDb provider has not been initialized");
		return api;
	};

	const provider: MetadataProvider = {
		id: "imdb",
		name: "IMDb",
		version: "1.0.0",
		supportedTypes: ["movie", "tv_show"],

		initialize(context) {
			logger = context.logger;
			api = new OMDbApi(config.apiKey, config.plot, context.http);
		},

		async search(type: "movie" | "tv_show", query: string, year?: number): Promise<ProviderSearchResult[]> {
			if (!query.trim()) return [];
			try {
				return await searchTitles(getApi(), type, query, year);
			} catch (error) {
				logger?.error("OMDb search failed", error, { type, query, year });
				return [];
			}
		},

		async getDetails(type: "movie" | "tv_show", externalId: string): Promise<ProviderMetadataResult | null> {
			try {
				return await getDetails(getApi(), type, externalId);
			} catch (error) {
				logger?.error("OMDb metadata details failed", error, { type, externalId });
				return null;
			}
		},

		async getDetailsByExternalIds(type: "movie" | "tv_show", identifiers: ExternalIdentifiers): Promise<ProviderMetadataResult | null> {
			const imdbId = identifiers.imdb?.trim();
			if (!isValidImdbId(imdbId)) return null;
			try {
				return await getDetails(getApi(), type, imdbId);
			} catch (error) {
				logger?.error("OMDb external id lookup failed", error, { type, identifiers });
				return null;
			}
		},

		async getImages(type: "movie" | "tv_show", externalId: string): Promise<Array<{ type: "poster" | "backdrop"; url: string }>> {
			try {
				const details = await getApi().byId(externalId);
				const poster = details?.Poster;
				if (!poster || poster === "N/A") return [];
				return [{ type: "poster", url: poster }];
			} catch (error) {
				logger?.error("OMDb artwork lookup failed", error, { type, externalId });
				return [];
			}
		},

		async getSeasonDetails(externalId: string, seasonNumber: number): Promise<ProviderSeasonResult | null> {
			try {
				return await getSeason(getApi(), externalId, seasonNumber);
			} catch (error) {
				logger?.error("OMDb season details failed", error, { externalId, seasonNumber });
				return null;
			}
		},

		async getEpisodeDetails(externalId: string, seasonNumber: number, episodeNumber: number): Promise<ProviderEpisodeResult | null> {
			try {
				return await getEpisode(getApi(), externalId, seasonNumber, episodeNumber);
			} catch (error) {
				logger?.error("OMDb episode details failed", error, { externalId, seasonNumber, episodeNumber });
				return null;
			}
		},

		async test(): Promise<boolean> {
			if (!config.apiKey) {
				logger?.warn("OMDb API key is not configured");
				return false;
			}
			try {
				const details = await getApi().byId("tt0111161", { plot: "short" });
				return Boolean(details);
			} catch (error) {
				logger?.error("OMDb test failed", error);
				return false;
			}
		},

		dispose() {
			api = undefined;
			logger = undefined;
		},
	};
	return provider;
}
