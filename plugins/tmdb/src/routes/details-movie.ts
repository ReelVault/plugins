import type { ProviderMetadataResult } from "reelvault-sdk/plugin";
import type { TMDBApi } from "../tmdb";

export async function getDetailsMovie(api: TMDBApi, id: string): Promise<ProviderMetadataResult | null> {
	const movie_id = Number(id);
	const details = await api.client.movies.details({
		movie_id,
		append_to_response: ["keywords", "credits"],
	});

	let hasMissingTranslation = false;
	let title = details.title;
	let overview = details.overview;
	let tagline = details.tagline;

	if (!(overview && title && tagline) && api.fallbackClient) {
		try {
			const fallbackDetails = await api.fallbackClient.movies.details({
				movie_id,
			});
			if (!overview && fallbackDetails.overview) {
				overview = fallbackDetails.overview;
				hasMissingTranslation = true;
			}
			if (!title && fallbackDetails.title) {
				title = fallbackDetails.title;
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

	return {
		externalId: id,

		title: title || details.original_title || "Unknown",
		originalTitle: details.original_title,
		overview: overview ?? undefined,
		tagline: tagline ?? undefined,

		releaseDate: details.release_date,
		status: details.status,

		budget: details.budget,
		revenue: details.revenue,

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

		seasons: undefined,
		collection: details.belongs_to_collection
			? [
					{
						id: details.belongs_to_collection.id.toString(),
						name: details.belongs_to_collection.name,
					},
				]
			: undefined,

		...api.basicMetadataParse({
			production_companies: details.production_companies,
			genres: details.genres,
			cast: details.credits.cast,
			crew: details.credits.crew,
			keywords: details.keywords.keywords,
		}),
	};
}
