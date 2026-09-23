import type { ProviderEpisodeResult, ProviderSeasonResult } from "reelvault-sdk/plugin";
import { type OMDbApi, type OmdbEpisode, parseNumber, toReleaseDate } from "../omdb";

export async function getSeason(api: OMDbApi, externalId: string, seasonNumber: number): Promise<ProviderSeasonResult | null> {
	const data = await api.byId(externalId, { Season: String(seasonNumber) });
	if (!data) return null;

	return {
		externalId: `${data.imdbID ?? externalId}:s${seasonNumber}`,
		seasonNumber,
		name: `Season ${seasonNumber}`,
		episodes: (data.Episodes ?? []).map((episode) => mapEpisode(episode, seasonNumber)),
	};
}

function mapEpisode(episode: OmdbEpisode, seasonNumber: number): ProviderEpisodeResult {
	const episodeNumber = Number.parseInt(episode.Episode, 10);
	return {
		externalId: episode.imdbID,
		seasonNumber,
		episodeNumber: Number.isInteger(episodeNumber) ? episodeNumber : episode.Episode,
		name: episode.Title,
		airDate: toReleaseDate(episode.Released) || undefined,
		voteAverage: parseNumber(episode.imdbRating),
		voteCount: parseNumber(episode.imdbVotes),
	};
}
