import { defineConfig, field, type InferConfig } from "@reelvault/sdk/plugin";

export const config = defineConfig({
	apiKey: field.secret({
		label: { en: "TMDB API key (optional)", pl: "Klucz API TMDB (opcjonalny)" },
		description: {
			en: "Your own TMDB API v3 key or Read Access Token, used to search for trailers.",
			pl: "Własny klucz API TMDB v3 lub Read Access Token, używany do wyszukiwania zwiastunów.",
		},
		required: false,
	}),
	preferredLanguage: field.select({
		label: { en: "Preferred trailer language", pl: "Preferowany język zwiastunów" },
		description: {
			en: "Trailer language to search first (falls back to the official English trailer).",
			pl: "Język zwiastunów wyszukiwany w pierwszej kolejności (w razie braku wraca do oficjalnego zwiastuna po angielsku).",
		},
		options: [
			{ label: { en: "English (en-US)", pl: "Angielski (en-US)" }, value: "en-US" },
			{ label: { en: "Polish (pl-PL)", pl: "Polski (pl-PL)" }, value: "pl-PL" },
		],
		default: "en-US",
	}),
});

export type TrailersConfig = InferConfig<typeof config>;
