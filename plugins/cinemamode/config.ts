import { defineConfig, field, type InferConfig } from "@reelvault/sdk/plugin";

export const config = defineConfig({
	enabled: field.boolean({
		label: { en: "Cinema mode enabled", pl: "Tryb kina włączony" },
		description: {
			en: "Before a movie starts, the player shows a few trailers of similar titles from your library. The viewer can always skip them.",
			pl: "Przed filmem odtwarzacz pokazuje kilka zwiastunów podobnych tytułów z Twojej biblioteki. Widz zawsze może je pominąć.",
		},
		default: false,
	}),
	tmdbApiKey: field.secret({
		label: { en: "TMDB API key (optional)", pl: "Klucz API TMDB (opcjonalny)" },
		description: {
			en: "Your own TMDB API v3 key or Read Access Token, used to search for trailers.",
			pl: "Własny klucz API TMDB v3 lub Read Access Token, używany do wyszukiwania zwiastunów.",
		},
		required: false,
	}),
	language: field.select({
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
	trailerCount: field.number({
		label: { en: "Trailers before the feature", pl: "Zwiastuny przed filmem" },
		description: {
			en: "How many trailers (1–5) to play before the feature.",
			pl: "Ile zwiastunów (1–5) odtworzyć przed filmem.",
		},
		default: 3,
		min: 1,
		max: 5,
		step: 1,
	}),
	libraryOnly: field.boolean({
		label: { en: "Library titles only", pl: "Tylko tytuły z biblioteki" },
		description: {
			en: "Pick trailers only from titles you already own. When off, similar provider titles may appear as well.",
			pl: "Wybieraj zwiastuny wyłącznie spośród tytułów, które już masz. Po wyłączeniu mogą się też pojawić podobne tytuły od dostawcy metadanych.",
		},
		default: true,
	}),
});

export type CinemamodeConfig = InferConfig<typeof config>;
