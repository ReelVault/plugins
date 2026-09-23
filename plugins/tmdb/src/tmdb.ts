import { type Cast, type Crew, type Genre, type Keyword, type Language, type ProductionCompany, TMDB } from "@lorenzopant/tmdb";
import type { ProviderPersonGender } from "@reelvault/sdk/plugin";

/**
 * TMDB accepts any ISO 639-1 code at runtime, but the SDK types `language` as a
 * closed union. This guard lets configured (arbitrary) language values through
 * while satisfying the SDK's type.
 */
export function toLanguage(value: string): Language {
	return isLanguage(value) ? value : "en-US";
}

function isLanguage(value: string): value is Language {
	return value.trim().length > 0;
}

export class TMDBApi {
	private readonly IMAGE_BASE = "https://image.tmdb.org/t/p/original";
	public client: TMDB;
	public fallbackClient?: TMDB;
	public language: string;
	public fallbackLanguage?: string;
	public searchLanguage: string;

	constructor(apiKey: string, language = "pl-PL", searchLanguage = "en-US", fallbackLanguage = "en-US") {
		this.language = language;
		this.fallbackLanguage = fallbackLanguage;
		this.searchLanguage = searchLanguage;
		this.client = new TMDB(apiKey, { language: toLanguage(language) });
		if (fallbackLanguage && fallbackLanguage !== language) {
			this.fallbackClient = new TMDB(apiKey, { language: toLanguage(fallbackLanguage) });
		}
	}

	getImagePath(path?: string | null): string | undefined {
		return path ? `${this.IMAGE_BASE}${path}` : undefined;
	}

	getGender(gender: number | undefined | null): ProviderPersonGender {
		if (gender === 1) return "female";
		if (gender === 2) return "male";
		return "other";
	}

	castParse(cast: Cast[]) {
		return cast.map((item) => ({
			id: item.id.toString(),
			name: item.name,
			profilePath: this.getImagePath(item.profile_path),
			gender: this.getGender(item.gender),
			popularity: item.popularity,

			role: item.known_for_department,
			character: item.character,
			order: item.order,
		}));
	}

	basicMetadataParse(data: {
		production_companies: ProductionCompany[] | undefined;
		genres: Genre[];
		cast: Cast[];
		crew: Crew[];
		keywords: Keyword[];
	}) {
		return {
			productionCompanies: data.production_companies?.map((c) => ({
				id: c.id.toString(),
				name: c.name,
			})),

			genres: data.genres.map((g) => ({
				id: g.id.toString(),
				name: g.name,
			})),

			cast: this.castParse(data.cast),
			crew: data.crew.map((item) => ({
				id: item.id.toString(),
				name: item.name,
				profilePath: this.getImagePath(item.profile_path),
				gender: this.getGender(item.gender),
				popularity: item.popularity,

				job: item.job,
				department: item.department,
			})),

			keywords: data.keywords.map((k) => ({
				id: k.id.toString(),
				name: k.name,
			})),
		};
	}
}
