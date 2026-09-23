import { defineConfig, field, type InferConfig } from "reelvault-sdk/plugin";

/** BCP-47-ish language tag accepted by TMDB, e.g. `pl` or `pt-BR`. */
const LANGUAGE_TAG = /^[a-z]{2,3}(?:-[A-Z]{2})?$/;

export const config = defineConfig({
	apiKey: field.secret({
		label: "TMDB API key (Read Access Token)",
		description: "API key or v4 token from themoviedb.org, used to fetch metadata and artwork.",
		required: true,
		default: "",
	}),
	language: field.string({
		label: "Metadata language",
		description: "ISO language code (e.g. en-US, pl-PL) used to fetch overviews, titles and details.",
		default: "en-US",
		pattern: LANGUAGE_TAG,
	}),
	fallbackLanguage: field.string({
		label: "Fallback language",
		description: "Fallback ISO language code (e.g. en-US) used when translated overviews or titles are missing.",
		default: "en-US",
		pattern: LANGUAGE_TAG,
	}),
	searchLanguage: field.string({
		label: "Search language",
		description: "ISO language code (e.g. en-US or pl-PL) used when searching TMDB — often en-US for English release names.",
		default: "en-US",
		pattern: LANGUAGE_TAG,
	}),
});

export type TmdbConfig = InferConfig<typeof config>;
