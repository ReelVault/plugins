import type { ProviderEpisodeResult } from "@reelvault/sdk/plugin";
import { buildCast, getImageUrl, isAvailable, type OMDbApi, parseNumber, toReleaseDate } from "../omdb";

export async function getEpisode(
	api: OMDbApi,
	externalId: string,
	seasonNumber: number,
	episodeNumber: number,
): Promise<ProviderEpisodeResult | null> {
	const data = await api.byId(externalId, { Season: String(seasonNumber), Episode: String(episodeNumber) });
	if (!data) return null;

	return {
		externalId: data.imdbID ?? externalId,
		seasonNumber,
		episodeNumber,
		name: data.Title ?? `Episode ${episodeNumber}`,
		overview: isAvailable(data.Plot) ? data.Plot : undefined,
		airDate: toReleaseDate(data.Released) || undefined,
		voteAverage: parseNumber(data.imdbRating),
		voteCount: parseNumber(data.imdbVotes),
		thumbnailPath: getImageUrl(data.Poster),
		cast: buildCast(data.Actors),
	};
}
