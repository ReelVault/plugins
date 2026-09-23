import type { ProviderSeasonResult } from "@reelvault/sdk/plugin";
import type { TMDBApi } from "../tmdb";

export async function getDetailsSeason(api: TMDBApi, externalId: string, seasonNumber: number): Promise<ProviderSeasonResult | null> {
	const series_id = Number(externalId);
	const details = await api.client.tv_seasons.details({ series_id, season_number: seasonNumber });

	let fallbackDetails: typeof details | null = null;
	let seasonOverview = details.overview;
	let seasonName = details.name;
	let hasMissingTranslation = false;

	if (!(seasonOverview && seasonName) && api.fallbackClient) {
		try {
			fallbackDetails = await api.fallbackClient.tv_seasons.details({ series_id, season_number: seasonNumber });
			if (!seasonOverview && fallbackDetails.overview) {
				seasonOverview = fallbackDetails.overview;
				hasMissingTranslation = true;
			}
			if (!seasonName && fallbackDetails.name) {
				seasonName = fallbackDetails.name;
				hasMissingTranslation = true;
			}
		} catch {
			// Fallback request failed, ignore
		}
	}

	if (!seasonOverview) {
		hasMissingTranslation = true;
	}

	return {
		externalId: details.id.toString(),
		seasonNumber: details.season_number,

		name: seasonName || (details.season_number === 0 ? "Specials" : `Season ${details.season_number}`),
		overview: seasonOverview || undefined,

		status: undefined,
		airDate: details.air_date,

		voteAverage: undefined,
		voteCount: undefined,

		posterPath: api.getImagePath(details.poster_path),

		episodes: details.episodes.map((i) => {
			let epOverview = i.overview;
			let epName = i.name;

			if (!(epOverview && epName) && fallbackDetails?.episodes) {
				const fbEp = fallbackDetails.episodes.find((e) => e.episode_number === i.episode_number);
				if (!epOverview && fbEp?.overview) {
					epOverview = fbEp.overview;
					hasMissingTranslation = true;
				}
				if (!epName && fbEp?.name) {
					epName = fbEp.name;
					hasMissingTranslation = true;
				}
			}

			return {
				externalId: i.id.toString(),
				episodeNumber: i.episode_number,
				seasonNumber: i.season_number,

				name: epName || `Episode ${i.episode_number}`,
				overview: epOverview || undefined,

				airDate: i.air_date,
				status: undefined,

				voteAverage: i.vote_average,
				voteCount: i.vote_count,

				thumbnailPath: api.getImagePath(i.still_path),
				hasMissingTranslation: !i.overview,

				cast: i.guest_stars.map((item) => ({
					id: item.id.toString(),
					name: item.name,
					profilePath: api.getImagePath(item.profile_path),
					gender: api.getGender(item.gender),
					popularity: item.popularity,

					role: item.known_for_department,
					character: item.character,
					order: item.order,
				})),
			};
		}),
		// Copied after the episode map so fallback fills from episodes are included.
		hasMissingTranslation,
	};
}
