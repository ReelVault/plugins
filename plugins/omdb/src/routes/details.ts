import type { ProviderMetadataResult, ProviderSeasonResult } from "reelvault-sdk/plugin";
import {
	buildCast,
	buildCrew,
	buildRatings,
	getImageUrl,
	isAvailable,
	type OMDbApi,
	type OmdbTitleResponse,
	parseNumber,
	splitList,
	toEntityId,
	toReleaseDate,
} from "../omdb";

export async function getDetails(api: OMDbApi, type: "movie" | "tv_show", externalId: string): Promise<ProviderMetadataResult | null> {
	const details = await api.byId(externalId);
	if (!details) return null;
	return mapDetails(details, type, externalId);
}

function mapDetails(details: OmdbTitleResponse, type: "movie" | "tv_show", externalId: string): ProviderMetadataResult {
	return {
		externalId: details.imdbID ?? externalId,
		title: details.Title ?? "Unknown",
		overview: isAvailable(details.Plot) ? details.Plot : undefined,
		releaseDate: toReleaseDate(details.Released, details.Year),
		voteAverage: parseNumber(details.imdbRating),
		voteCount: parseNumber(details.imdbVotes),
		ratings: buildRatings(details),
		posterPath: getImageUrl(details.Poster),
		hasMissingTranslation: false,
		seasons: type === "tv_show" ? buildSeasons(details, externalId) : undefined,
		genres: splitList(details.Genre).map((name) => ({ id: toEntityId("genre", name), name })),
		productionCompanies: splitList(details.Production).map((name) => ({ id: toEntityId("company", name), name })),
		cast: buildCast(details.Actors),
		crew: buildCrew(details.Director, details.Writer),
	};
}

function buildSeasons(details: OmdbTitleResponse, externalId: string): ProviderSeasonResult[] | undefined {
	const total = details.totalSeasons ? Number.parseInt(details.totalSeasons, 10) : Number.NaN;
	if (!Number.isInteger(total) || total <= 0) return undefined;
	const id = details.imdbID ?? externalId;
	return Array.from({ length: total }, (_, index) => {
		const seasonNumber = index + 1;
		return {
			externalId: `${id}:s${seasonNumber}`,
			seasonNumber,
			name: `Season ${seasonNumber}`,
		};
	});
}
