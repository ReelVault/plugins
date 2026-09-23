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

function parseVideoResults(payload: unknown): TmdbVideoResult[] {
	if (!(isRecord(payload) && Array.isArray(payload.results))) return [];
	return payload.results.filter(isTmdbVideoResult);
}

/** Minimal TMDB videos lookup — the same scoring as the Trailers plugin. */
export class TmdbClient {
	private readonly apiKey: string;
	private readonly preferredLang: string;

	constructor(apiKey?: string, preferredLang = "pl-PL") {
		this.apiKey = (apiKey ?? "").trim();
		this.preferredLang = preferredLang;
	}

	imageUrl(path: string | undefined | null, size = "w780"): string | undefined {
		if (!path) return undefined;
		return `https://image.tmdb.org/t/p/${size}${path}`;
	}

	/** Best official trailer for a TMDB movie/show id, or null when none exists. */
	async fetchTrailer(tmdbId: number, mediaType: "movie" | "tv_show"): Promise<{ key: string; name: string } | null> {
		const langCode = this.preferredLang.split("-")[0]?.toLowerCase() ?? "pl";

		let videos = await this.queryVideos(`/${mediaType === "movie" ? "movie" : "tv"}/${tmdbId}/videos`, langCode);
		if (mediaType === "tv_show" && videos.length === 0) {
			videos = await this.queryVideos(`/tv/${tmdbId}/season/1/videos`, langCode);
		}

		const youtubeVideos = videos.filter((v) => v.site === "YouTube" && v.key);
		if (youtubeVideos.length === 0) return null;

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
			if (nameLower.includes("zwiastun") || nameLower.includes("trailer")) score += 10;
			if (nameLower.includes("official") || nameLower.includes("oficjalny")) score += 5;

			if (score > bestScore) {
				bestScore = score;
				bestVideo = vid;
			}
		}

		if (!bestVideo) return null;
		return { key: bestVideo.key, name: bestVideo.name };
	}

	private async queryVideos(endpoint: string, langCode: string): Promise<TmdbVideoResult[]> {
		if (!this.apiKey) return [];

		try {
			const url = new URL(`https://api.themoviedb.org/3${endpoint}`);
			url.searchParams.set("include_video_language", `${langCode},en,null`);
			if (!this.apiKey.startsWith("ey")) {
				url.searchParams.set("api_key", this.apiKey);
			}

			const res = await fetch(url, {
				headers: this.apiKey.startsWith("ey")
					? { Authorization: `Bearer ${this.apiKey}`, Accept: "application/json" }
					: { Accept: "application/json" },
				signal: AbortSignal.timeout(6000),
			});

			if (!res.ok) return [];
			const payload: unknown = await res.json();
			return parseVideoResults(payload);
		} catch {
			return [];
		}
	}
}
