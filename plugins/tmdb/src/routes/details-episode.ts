import type { ProviderEpisodeResult } from "reelvault-sdk/plugin";
import type { TMDBApi } from "../tmdb";

export async function getDetailsEpisode(
	api: TMDBApi,
	externalId: string,
	seasonNumber: number,
	episodeNumber: number,
): Promise<ProviderEpisodeResult | null> {
	const tvShowID = Number(externalId);
	const details = await api.client.tv_episodes.details({
		series_id: tvShowID,
		season_number: seasonNumber,
		episode_number: episodeNumber,
		append_to_response: ["credits"],
	});

	let epName = details.name;
	let epOverview = details.overview;
	let hasMissingTranslation = false;

	if (!(epName && epOverview) && api.fallbackClient) {
		try {
			const fallbackDetails = await api.fallbackClient.tv_episodes.details({
				series_id: tvShowID,
				season_number: seasonNumber,
				episode_number: episodeNumber,
			});
			if (!epOverview && fallbackDetails.overview) {
				epOverview = fallbackDetails.overview;
				hasMissingTranslation = true;
			}
			if (!epName && fallbackDetails.name) {
				epName = fallbackDetails.name;
				hasMissingTranslation = true;
			}
		} catch {
			// Fallback request failed, ignore
		}
	}

	if (!(epOverview && details.overview)) {
		hasMissingTranslation = true;
	}

	return {
		externalId: details.id.toString(),
		episodeNumber: details.episode_number,
		seasonNumber: details.season_number,

		name: epName || `Episode ${details.episode_number}`,
		overview: epOverview || undefined,

		airDate: details.air_date,
		status: undefined,

		voteAverage: details.vote_average,
		voteCount: details.vote_count,

		thumbnailPath: api.getImagePath(details.still_path),
		hasMissingTranslation,

		cast: details.credits.cast.map((item) => ({
			id: item.id.toString(),

			name: item.name,
			gender: api.getGender(item.gender),
			popularity: item.popularity,
			profilePath: api.getImagePath(item.profile_path),

			role: item.known_for_department,
			character: item.character,
			order: item.order,
		})),
	};
}
