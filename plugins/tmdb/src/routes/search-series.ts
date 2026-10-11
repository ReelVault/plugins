import type { Language, TMDB } from "@lorenzopant/tmdb";
import type { ProviderSearchResult } from "@reelvault/sdk/plugin";
import { type TMDBApi, toLanguage } from "../tmdb";

interface SeriesHit {
	id: number;
	name: string;
	original_name?: string;
	original_language?: string;
	first_air_date: string;
	poster_path?: string | null;
	overview?: string;
	popularity?: number;
	vote_average?: number;
	vote_count?: number;
}

async function findSeries(client: TMDB, query: string, language: Language, year?: number): Promise<SeriesHit[]> {
	if (year) {
		const response = await client.search.tv_series({
			query,
			language,
			first_air_date_year: year,
		});
		if (response.results.length > 0) return response.results;
	}

	const response = await client.search.tv_series({
		query,
		language,
	});
	return response.results;
}

export async function searchSeries(api: TMDBApi, query: string, year?: number, hintLanguage?: string): Promise<ProviderSearchResult[]> {
	const searchLanguage = toLanguage(hintLanguage ?? api.searchLanguage);

	let results = await findSeries(api.client, query, searchLanguage, year);

	// Nothing in the requested language: search again in the fallback language, as details do.
	if (results.length === 0 && api.fallbackClient && api.fallbackLanguage) {
		try {
			results = await findSeries(api.fallbackClient, query, toLanguage(api.fallbackLanguage), year);
		} catch {
			// Fallback request failed, keep the empty result
		}
	}

	return results.map((item) => ({
		externalId: item.id.toString(),
		title: item.name,
		originalTitle: item.original_name,
		originalLanguage: item.original_language,
		releaseDate: item.first_air_date,
		posterPath: api.getImagePath(item.poster_path),
		overview: item.overview,
		popularity: item.popularity,
		voteAverage: item.vote_average,
		voteCount: item.vote_count,
	}));
}
