import type { Language, TMDB } from "@lorenzopant/tmdb";
import type { ProviderSearchResult } from "@reelvault/sdk/plugin";
import { type TMDBApi, toLanguage } from "../tmdb";

interface MovieHit {
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
}

async function findMovies(client: TMDB, query: string, language: Language, year?: number): Promise<MovieHit[]> {
	if (year) {
		const response = await client.search.movies({
			query,
			language,
			primary_release_year: year.toString(),
		});
		if (response.results.length > 0) return response.results;
	}

	const response = await client.search.movies({
		query,
		language,
	});
	return response.results;
}

export async function searchMovie(api: TMDBApi, query: string, year?: number, hintLanguage?: string): Promise<ProviderSearchResult[]> {
	const searchLanguage = toLanguage(hintLanguage ?? api.searchLanguage);

	let results = await findMovies(api.client, query, searchLanguage, year);

	// Nothing in the requested language: search again in the fallback language, as details do.
	if (results.length === 0 && api.fallbackClient && api.fallbackLanguage) {
		try {
			results = await findMovies(api.fallbackClient, query, toLanguage(api.fallbackLanguage), year);
		} catch {
			// Fallback request failed, keep the empty result
		}
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
