interface TmdbVideoResult {
	id: string;
	iso_639_1: string;
	iso_3166_1: string;
	key: string;
	name: string;
	site: string;
	size: number;
	type: string;
	official: boolean;
	published_at: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function isTmdbVideoResult(value: unknown): value is TmdbVideoResult {
	if (!isRecord(value)) return false;
	return (
		typeof value.id === "string" &&
		typeof value.iso_639_1 === "string" &&
		typeof value.iso_3166_1 === "string" &&
		typeof value.key === "string" &&
		typeof value.name === "string" &&
		typeof value.site === "string" &&
		typeof value.size === "number" &&
		typeof value.type === "string" &&
		typeof value.official === "boolean" &&
		typeof value.published_at === "string"
	);
}

function parseSearchFirstId(payload: unknown): number | undefined {
	if (!(isRecord(payload) && Array.isArray(payload.results))) return undefined;
	const first: unknown = payload.results[0];
	if (!isRecord(first) || typeof first.id !== "number") return undefined;
	return first.id;
}

function parseVideoResults(payload: unknown): TmdbVideoResult[] {
	if (!(isRecord(payload) && Array.isArray(payload.results))) return [];
	return payload.results.filter(isTmdbVideoResult);
}

export class TmdbTrailersClient {
	private readonly apiKey: string;
	private readonly preferredLang: string;

	constructor(apiKey?: string, preferredLang = "pl-PL") {
		this.apiKey = (apiKey ?? "").trim();
		this.preferredLang = preferredLang;
	}

	private getHeaders(): HeadersInit {
		if (this.apiKey.startsWith("ey")) {
			return {
				Authorization: `Bearer ${this.apiKey}`,
				Accept: "application/json",
			};
		}
		return {
			Accept: "application/json",
		};
	}

	private getUrl(endpoint: string, queryParams: Record<string, string> = {}): string {
		const url = new URL(`https://api.themoviedb.org/3${endpoint}`);
		if (!this.apiKey.startsWith("ey")) {
			url.searchParams.set("api_key", this.apiKey);
		}
		for (const [k, v] of Object.entries(queryParams)) {
			url.searchParams.set(k, v);
		}
		return url.toString();
	}

	/**
	 * Searches TMDB by title and year if tmdbId is not directly known.
	 */
	async searchTmdbId(
		title: string,
		mediaType: "movie" | "tv_show",
		year?: number,
	): Promise<{ id: number; mediaType: "movie" | "tv_show" } | null> {
		if (!this.apiKey) return null;

		const primaryEndpoint = mediaType === "movie" ? "/search/movie" : "/search/tv";
		const secondaryEndpoint = mediaType === "movie" ? "/search/tv" : "/search/movie";

		const primaryParams: Record<string, string> = {
			query: title,
			include_adult: "false",
			language: this.preferredLang,
		};
		if (year) {
			if (mediaType === "movie") primaryParams.year = String(year);
			else primaryParams.first_air_date_year = String(year);
		}

		try {
			// 1. Primary search
			const res = await fetch(this.getUrl(primaryEndpoint, primaryParams), {
				headers: this.getHeaders(),
				signal: AbortSignal.timeout(6000),
			});
			if (res.ok) {
				const payload: unknown = await res.json();
				const id = parseSearchFirstId(payload);
				if (id) {
					return { id, mediaType };
				}
			}

			// 2. Secondary fallback search (movie -> tv or tv -> movie)
			const secParams: Record<string, string> = {
				query: title,
				include_adult: "false",
				language: this.preferredLang,
			};
			const fallbackType = mediaType === "movie" ? "tv_show" : "movie";
			const secRes = await fetch(this.getUrl(secondaryEndpoint, secParams), {
				headers: this.getHeaders(),
				signal: AbortSignal.timeout(6000),
			});
			if (secRes.ok) {
				const payload: unknown = await secRes.json();
				const id = parseSearchFirstId(payload);
				if (id) {
					return { id, mediaType: fallbackType };
				}
			}
		} catch {
			return null;
		}

		return null;
	}

	/**
	 * Fetches video trailers from TMDB.
	 */
	async fetchTrailer(
		tmdbId: number,
		mediaType: "movie" | "tv_show",
	): Promise<{ key: string; name: string; official: boolean; language: string; site: "YouTube" } | null> {
		const langCode = this.preferredLang.split("-")[0]?.toLowerCase() ?? "pl";

		// Try primary endpoint
		let videos = await this.queryVideos(`/${mediaType === "movie" ? "movie" : "tv"}/${tmdbId}/videos`, langCode);

		// If TV show and no videos at show level, check season 1
		if (mediaType === "tv_show" && videos.length === 0) {
			videos = await this.queryVideos(`/tv/${tmdbId}/season/1/videos`, langCode);
		}

		const youtubeVideos = videos.filter((v) => v.site === "YouTube" && v.key);
		if (youtubeVideos.length === 0) return null;

		// Score candidate videos to find the best official trailer
		let bestVideo: TmdbVideoResult | null = null;
		let bestScore = -1;

		for (const vid of youtubeVideos) {
			let score = 0;
			const vidLang = (vid.iso_639_1 || "").toLowerCase();
			const isPreferredLang = vidLang === langCode;
			const isEnglish = vidLang === "en" || vidLang === "";

			if (vid.type === "Trailer") score += 50;
			else if (vid.type === "Teaser") score += 20;
			else score += 5;

			if (vid.official) score += 30;

			if (isPreferredLang) score += 40;
			else if (isEnglish) score += 15;

			const nameLower = vid.name.toLowerCase();
			if (nameLower.includes("zwiastun") || nameLower.includes("trailer")) {
				score += 10;
			}
			if (nameLower.includes("official") || nameLower.includes("oficjalny")) {
				score += 5;
			}

			if (score > bestScore) {
				bestScore = score;
				bestVideo = vid;
			}
		}

		if (!bestVideo) return null;

		return {
			key: bestVideo.key,
			name: bestVideo.name,
			official: bestVideo.official,
			language: bestVideo.iso_639_1,
			site: "YouTube",
		};
	}

	private async queryVideos(endpoint: string, langCode: string): Promise<TmdbVideoResult[]> {
		if (!this.apiKey) return [];

		try {
			const res = await fetch(
				this.getUrl(endpoint, {
					include_video_language: `${langCode},en,null`,
				}),
				{
					headers: this.getHeaders(),
					signal: AbortSignal.timeout(6000),
				},
			);

			if (!res.ok) return [];
			const payload: unknown = await res.json();
			return parseVideoResults(payload);
		} catch {
			return [];
		}
	}
}
