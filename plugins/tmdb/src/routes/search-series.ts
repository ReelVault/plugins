import type { ProviderSearchResult } from "reelvault-sdk/plugin";
import { type TMDBApi, toLanguage } from "../tmdb";

export async function searchSeries(api: TMDBApi, query: string, year?: number): Promise<ProviderSearchResult[]> {
	const searchLanguage = toLanguage(api.searchLanguage || api.language);

	let results: Array<{
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
	}> = [];

	if (year) {
		const response = await api.client.search.tv_series({
			query,
			language: searchLanguage,
			first_air_date_year: year,
		});
		results = response.results;
	}

	if (results.length === 0) {
		const response = await api.client.search.tv_series({
			query,
			language: searchLanguage,
		});
		results = response.results;
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
