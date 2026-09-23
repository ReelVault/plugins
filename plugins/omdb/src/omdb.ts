import type { MetadataProviderContext, ProviderRating, ProviderResultCast, ProviderResultCrew } from "@reelvault/sdk/plugin";

export type OmdbPlot = "short" | "full";
export type OmdbMediaType = "movie" | "series";

export interface OmdbSearchItem {
	Title: string;
	Year: string;
	imdbID: string;
	Type: string;
	Poster: string;
}

export interface OmdbEpisode {
	Title: string;
	Released: string;
	Episode: string;
	imdbRating: string;
	imdbVotes: string;
	imdbID: string;
	Season?: string;
}

export interface OmdbTitleResponse {
	Response: string;
	Error?: string;
	Title?: string;
	Year?: string;
	Released?: string;
	Runtime?: string;
	Genre?: string;
	Director?: string;
	Writer?: string;
	Actors?: string;
	Plot?: string;
	Language?: string;
	Country?: string;
	Poster?: string;
	imdbRating?: string;
	imdbVotes?: string;
	imdbID?: string;
	Type?: string;
	Production?: string;
	totalSeasons?: string;
	Ratings?: Array<{ Source: string; Value: string }>;
	Episodes?: OmdbEpisode[];
}

interface OmdbSearchResponse {
	Response: string;
	Error?: string;
	Search?: OmdbSearchItem[];
	totalResults?: string;
}

const NOT_AVAILABLE = "N/A";
const BASE_URL = "https://www.omdbapi.com/";
const RATE_LIMIT_PATTERN = /limit/i;
const IMDB_ID_PATTERN = /^tt\d{5,}$/i;
const YEAR_PATTERN = /(\d{4})/;
const RELEASED_DATE_PATTERN = /^(\d{1,2})\s+([A-Za-z]{3,})\s+(\d{4})$/;
const FRACTION_RATING_PATTERN = /^([\d.]+)\s*\/\s*([\d.]+)$/;
const PERCENT_RATING_PATTERN = /^([\d.]+)\s*%$/;
const MONTH_ABBREVIATIONS: Record<string, string> = {
	jan: "01",
	feb: "02",
	mar: "03",
	apr: "04",
	may: "05",
	jun: "06",
	jul: "07",
	aug: "08",
	sep: "09",
	oct: "10",
	nov: "11",
	dec: "12",
};

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function isOmdbTitleResponse(value: unknown): value is OmdbTitleResponse {
	return isRecord(value) && typeof value.Response === "string";
}

function isOmdbSearchResponse(value: unknown): value is OmdbSearchResponse {
	return isRecord(value) && typeof value.Response === "string";
}

export class OmdbApiError extends Error {}

export class OMDbApi {
	private readonly apiKey: string;
	private readonly plot: OmdbPlot;
	private readonly http: MetadataProviderContext["http"];

	constructor(apiKey: string, plot: OmdbPlot, http: MetadataProviderContext["http"]) {
		this.apiKey = apiKey;
		this.plot = plot;
		this.http = http;
	}

	async search(query: string, type: OmdbMediaType, year?: number): Promise<OmdbSearchItem[]> {
		const params: Record<string, string> = { s: query, type };
		if (year) params.y = String(year);
		const data = await this.request(params, isOmdbSearchResponse);
		return data.Search ?? [];
	}

	async byId(imdbId: string, extra?: Record<string, string>): Promise<OmdbTitleResponse | null> {
		const params: Record<string, string> = { i: imdbId, plot: this.plot };
		if (extra) Object.assign(params, extra);
		const data = await this.request(params, isOmdbTitleResponse);
		if (data.Response !== "True") return null;
		return data;
	}

	private async request<T extends { Response?: string; Error?: string }>(
		params: Record<string, string>,
		guard: (value: unknown) => value is T,
	): Promise<T> {
		const url = new URL(BASE_URL);
		url.searchParams.set("apikey", this.apiKey);
		for (const [key, value] of Object.entries(params)) {
			url.searchParams.set(key, value);
		}

		const response = await this.http(url.toString());
		if (!response.ok) {
			throw new OmdbApiError(`OMDb request failed with status ${response.status}`);
		}

		const data: unknown = await response.json();
		if (!guard(data)) {
			throw new OmdbApiError("OMDb returned an unexpected response payload");
		}
		if (data.Response === "False" && isRateLimitError(data.Error)) {
			throw new OmdbApiError(data.Error ?? "OMDb request limit reached");
		}
		return data;
	}
}

function isRateLimitError(message?: string): boolean {
	return Boolean(message && RATE_LIMIT_PATTERN.test(message));
}

export function isValidImdbId(value: string | undefined): value is string {
	return Boolean(value && IMDB_ID_PATTERN.test(value.trim()));
}

export function isAvailable(value: string | undefined): value is string {
	return Boolean(value && value !== NOT_AVAILABLE);
}

export function getImageUrl(poster: string | undefined): string | undefined {
	return isAvailable(poster) ? poster : undefined;
}

export function extractYear(value: string | undefined): string | undefined {
	const match = value?.match(YEAR_PATTERN);
	return match?.[1];
}

export function toReleaseDate(released: string | undefined, year?: string): string {
	const parsed = parseReleasedDate(released);
	return parsed ?? extractYear(year) ?? "";
}

function parseReleasedDate(released: string | undefined): string | undefined {
	if (!isAvailable(released)) return undefined;
	const match = released.trim().match(RELEASED_DATE_PATTERN);
	if (!match) return undefined;
	const day = match[1];
	const month = MONTH_ABBREVIATIONS[match[2]?.slice(0, 3).toLowerCase() ?? ""];
	const year = match[3];
	if (!(day && month && year)) return undefined;
	return `${year}-${month}-${day.padStart(2, "0")}`;
}

export function parseNumber(value: string | undefined): number | undefined {
	if (!isAvailable(value)) return undefined;
	const parsed = Number.parseFloat(value.replaceAll(",", "").trim());
	return Number.isFinite(parsed) ? parsed : undefined;
}

export function splitList(value: string | undefined): string[] {
	if (!isAvailable(value)) return [];
	return value
		.split(",")
		.map((item) => item.trim())
		.filter((item) => item.length > 0 && item !== NOT_AVAILABLE);
}

export function slugify(value: string): string {
	return value
		.normalize("NFKD")
		.replace(/\p{Diacritic}/gu, "")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
}

export function toEntityId(prefix: string, name: string): string {
	return `${prefix}:${slugify(name) || "unknown"}`;
}

const RATING_SOURCES: Record<string, { source: string; label: string }> = {
	"internet movie database": { source: "imdb", label: "IMDb" },
	"rotten tomatoes": { source: "rottentomatoes", label: "Rotten Tomatoes" },
	metacritic: { source: "metacritic", label: "Metacritic" },
};

/** Parses OMDb rating values like `5.7/10`, `52%` or `47/100` into value + scale. */
export function parseRatingValue(raw: string): { value: number; maxValue: number } | undefined {
	const value = raw.trim();
	const fraction = value.match(FRACTION_RATING_PATTERN);
	if (fraction?.[1] && fraction[2]) {
		const parsedValue = Number.parseFloat(fraction[1]);
		const maxValue = Number.parseFloat(fraction[2]);
		if (Number.isFinite(parsedValue) && Number.isFinite(maxValue) && maxValue > 0) return { value: parsedValue, maxValue };
		return undefined;
	}

	const percent = value.match(PERCENT_RATING_PATTERN);
	if (percent?.[1]) {
		const parsedValue = Number.parseFloat(percent[1]);
		return Number.isFinite(parsedValue) ? { value: parsedValue, maxValue: 100 } : undefined;
	}

	const plain = Number.parseFloat(value);
	return Number.isFinite(plain) ? { value: plain, maxValue: 10 } : undefined;
}

/**
 * OMDb exposes several ratings at once (IMDb, Rotten Tomatoes, Metacritic).
 * Returns them de-duplicated by source, falling back to `imdbRating` when the
 * `Ratings` array is missing.
 */
export function buildRatings(details: OmdbTitleResponse): ProviderRating[] | undefined {
	const ratings: ProviderRating[] = [];
	const seen = new Set<string>();

	for (const raw of details.Ratings ?? []) {
		const parsed = parseRatingValue(raw.Value);
		if (!parsed) continue;
		const mapped = RATING_SOURCES[raw.Source.trim().toLowerCase()] ?? {
			source: slugify(raw.Source) || "unknown",
			label: raw.Source.trim(),
		};
		if (seen.has(mapped.source)) continue;
		seen.add(mapped.source);
		ratings.push({
			source: mapped.source,
			label: mapped.label,
			value: parsed.value,
			maxValue: parsed.maxValue,
			votes: mapped.source === "imdb" ? parseNumber(details.imdbVotes) : undefined,
		});
	}

	if (!seen.has("imdb")) {
		const imdbRating = parseNumber(details.imdbRating);
		if (imdbRating !== undefined) {
			ratings.push({ source: "imdb", label: "IMDb", value: imdbRating, maxValue: 10, votes: parseNumber(details.imdbVotes) });
		}
	}

	return ratings.length > 0 ? ratings : undefined;
}

export function buildCast(actors: string | undefined): ProviderResultCast[] {
	return splitList(actors).map((name, index) => ({
		id: toEntityId("person", name),
		name,
		role: "Actor",
		character: "",
		order: index,
	}));
}

export function buildCrew(director: string | undefined, writer: string | undefined): ProviderResultCrew[] {
	const crew: ProviderResultCrew[] = [];
	for (const name of splitList(director)) {
		crew.push({ id: toEntityId("person", name), name, job: "Director", department: "Directing" });
	}
	for (const name of splitList(writer)) {
		crew.push({ id: toEntityId("person", name), name, job: "Writer", department: "Writing" });
	}
	return crew;
}
