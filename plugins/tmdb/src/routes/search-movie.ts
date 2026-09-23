import type { ProviderSearchResult } from "reelvault-sdk/plugin";
import { type TMDBApi, toLanguage } from "../tmdb";

export async function searchMovie(api: TMDBApi, query: string, year?: number): Promise<ProviderSearchResult[]> {
	const searchLanguage = toLanguage(api.searchLanguage || api.language);

	let results: Array<{
		id: number;
		title: string;
		original_title?: string;
		original_language?: string;
		release_date: string;
		poster_path?: string | null;
		overview?: string;
		popularity?: number;
		vote_average?: number;
		vote_count?: number;
	}> = [];

	if (year) {
		const response = await api.client.search.movies({
			query,
			language: searchLanguage,
			primary_release_year: year.toString(),
		});
		results = response.results;
	}

	if (results.length === 0) {
		const response = await api.client.search.movies({
			query,
			language: searchLanguage,
		});
		results = response.results;
	}

	return results.map((item) => ({
		externalId: item.id.toString(),
		title: item.title,
		originalTitle: item.original_title,
		originalLanguage: item.original_language,
		releaseDate: item.release_date,
		posterPath: api.getImagePath(item.poster_path),
		overview: item.overview,
		popularity: item.popularity,
		voteAverage: item.vote_average,
		voteCount: item.vote_count,
	}));
}
