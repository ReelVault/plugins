import { defineConfig, field, type InferConfig } from "@reelvault/sdk/plugin";

/** BCP-47-ish language tag accepted by TMDB, e.g. `pl` or `pt-BR`. */
const LANGUAGE_TAG = /^[a-z]{2,3}(?:-[A-Z]{2})?$/;

export const config = defineConfig({
	apiKey: field.secret({
		label: { en: "TMDB API key (Read Access Token)", pl: "Klucz API TMDB (Read Access Token)" },
		description: {
			en: "API key or v4 token from themoviedb.org, used to fetch metadata and artwork.",
			pl: "Klucz API lub token v4 z themoviedb.org, używany do pobierania metadanych i grafik.",
		},
		required: true,
		default: "",
	}),
	language: field.string({
		label: { en: "Metadata language", pl: "Język metadanych" },
		description: {
			en: "ISO language code (e.g. en-US, pl-PL) used to fetch overviews, titles and details.",
			pl: "Kod języka ISO (np. en-US, pl-PL) używany do pobierania opisów, tytułów i szczegółów.",
		},
		default: "en-US",
		pattern: LANGUAGE_TAG,
	}),
	fallbackLanguage: field.string({
		label: { en: "Fallback language", pl: "Język zapasowy" },
		description: {
			en: "Fallback ISO language code (e.g. en-US) used when translated overviews or titles are missing.",
			pl: "Zapasowy kod języka ISO (np. en-US), używany, gdy brakuje przetłumaczonego opisu lub tytułu.",
		},
		default: "en-US",
		pattern: LANGUAGE_TAG,
	}),
	searchLanguage: field.string({
		label: { en: "Search language", pl: "Język wyszukiwania" },
		description: {
			en: "ISO language code (e.g. en-US or pl-PL) used when searching TMDB — often en-US for English release names.",
			pl: "Kod języka ISO (np. en-US lub pl-PL) używany przy wyszukiwaniu w TMDB — często en-US daje lepsze wyniki dla angielskich nazw wydań.",
		},
		default: "en-US",
		pattern: LANGUAGE_TAG,
	}),
});

export type TmdbConfig = InferConfig<typeof config>;
