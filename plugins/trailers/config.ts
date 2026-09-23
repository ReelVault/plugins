import { defineConfig, field, type InferConfig } from "@reelvault/sdk/plugin";

export const config = defineConfig({
	apiKey: field.secret({
		label: "TMDB API key (optional)",
		description: "Your own TMDB API v3 key or Read Access Token, used to search for trailers.",
		required: false,
	}),
	preferredLanguage: field.select({
		label: "Preferred trailer language",
		description: "Trailer language to search first (falls back to the official English trailer).",
		options: [
			{ label: "English (en-US)", value: "en-US" },
			{ label: "Polish (pl-PL)", value: "pl-PL" },
		],
		default: "en-US",
	}),
});

export type TrailersConfig = InferConfig<typeof config>;
