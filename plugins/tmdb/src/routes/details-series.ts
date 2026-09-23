import type { ProviderMetadataResult } from "@reelvault/sdk/plugin";
import type { TMDBApi } from "../tmdb";

export async function getDetailsSeries(api: TMDBApi, id: string): Promise<ProviderMetadataResult | null> {
	const tvShowId = Number(id);
	const details = await api.client.tv_series.details({
		series_id: tvShowId,
		append_to_response: ["keywords", "credits"],
	});

	let hasMissingTranslation = false;
	let title = details.name;
	let overview = details.overview;
	let tagline = details.tagline;

	let fallbackDetails: typeof details | null = null;
	if (!(overview && title && tagline) && api.fallbackClient) {
		try {
			fallbackDetails = await api.fallbackClient.tv_series.details({
				series_id: tvShowId,
				append_to_response: ["keywords", "credits"],
			});
			if (!overview && fallbackDetails.overview) {
				overview = fallbackDetails.overview;
				hasMissingTranslation = true;
			}
			if (!title && fallbackDetails.name) {
				title = fallbackDetails.name;
				hasMissingTranslation = true;
			}
			if (!tagline && fallbackDetails.tagline) {
				tagline = fallbackDetails.tagline;
			}
		} catch {
			// Fallback request failed, ignore
		}
	}

	if (!(overview && details.overview)) {
		hasMissingTranslation = true;
	}

	const seasons = details.seasons?.map((i) => {
		let seasonOverview = i.overview;
		let seasonName = i.name;
		if (!(seasonOverview && seasonName) && fallbackDetails?.seasons) {
			const fbSeason = fallbackDetails.seasons.find((s) => s.season_number === i.season_number);
			if (!seasonOverview && fbSeason?.overview) {
				seasonOverview = fbSeason.overview;
				hasMissingTranslation = true;
			}
			if (!seasonName && fbSeason?.name) {
				seasonName = fbSeason.name;
				hasMissingTranslation = true;
			}
		}
		if (!seasonOverview) {
			hasMissingTranslation = true;
		}

		return {
			externalId: i.id.toString(),
			seasonNumber: i.season_number,

			name: seasonName || (i.season_number === 0 ? "Specials" : `Season ${i.season_number}`),
			overview: seasonOverview || undefined,
			episodeCount: i.episode_count,

			airDate: i.air_date,
			status: undefined,

			voteAverage: undefined,
			voteCount: undefined,

			episodes: undefined,
			posterPath: api.getImagePath(i.poster_path),
		};
	});

	return {
		externalId: id,

		title: title || details.original_name || "Unknown",
		originalTitle: details.original_name,
		overview: overview ?? undefined,
		tagline: tagline ?? undefined,

		releaseDate: details.first_air_date,
		status: details.status,

		budget: undefined,
		revenue: undefined,

		voteAverage: details.vote_average,
		voteCount: details.vote_count,
		ratings:
			details.vote_average > 0
				? [{ source: "tmdb", label: "TMDB", value: details.vote_average, maxValue: 10, votes: details.vote_count }]
				: undefined,
		popularity: details.popularity,

		posterPath: api.getImagePath(details.poster_path),
		backdropPath: api.getImagePath(details.backdrop_path),
		logoPath: undefined,

		hasMissingTranslation,
		collection: undefined,
		seasons,

		...api.basicMetadataParse({
			production_companies: details.production_companies,
			genres: details.genres,
			cast: details.credits.cast,
			crew: details.credits.crew,
			keywords: details.keywords.results,
		}),
	};
}
