import type { ProviderSearchResult } from "@reelvault/sdk/plugin";
import { extractYear, getImageUrl, type OMDbApi } from "../omdb";

export async function searchTitles(api: OMDbApi, type: "movie" | "tv_show", query: string, year?: number): Promise<ProviderSearchResult[]> {
	const omdbType = type === "tv_show" ? "series" : "movie";
	let results = await api.search(query, omdbType, year);
	if (results.length === 0 && year) {
		results = await api.search(query, omdbType);
	}

	return results.map((item) => ({
		externalId: item.imdbID,
		title: item.Title,
		releaseDate: extractYear(item.Year) ?? "",
		posterPath: getImageUrl(item.Poster),
	}));
}
