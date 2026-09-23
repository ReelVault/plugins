import { defineConfig, field, type InferConfig } from "reelvault-sdk/plugin";

export const config = defineConfig({
	enabled: field.boolean({
		label: "Cinema mode enabled",
		description:
			"Before a movie starts, the player shows a few trailers of similar titles from your library. The viewer can always skip them.",
		default: false,
	}),
	tmdbApiKey: field.secret({
		label: "TMDB API key (optional)",
		description: "Your own TMDB API v3 key or Read Access Token, used to search for trailers.",
		required: false,
	}),
	language: field.select({
		label: "Preferred trailer language",
		description: "Trailer language to search first (falls back to the official English trailer).",
		options: [
			{ label: "English (en-US)", value: "en-US" },
			{ label: "Polish (pl-PL)", value: "pl-PL" },
		],
		default: "en-US",
	}),
	trailerCount: field.number({
		label: "Trailers before the feature",
		description: "How many trailers (1–5) to play before the feature.",
		default: 3,
		min: 1,
		max: 5,
		step: 1,
	}),
	libraryOnly: field.boolean({
		label: "Library titles only",
		description: "Pick trailers only from titles you already own. When off, similar provider titles may appear as well.",
		default: true,
	}),
});

export type CinemamodeConfig = InferConfig<typeof config>;
