import { defineConfig, field, type InferConfig } from "@reelvault/sdk/plugin";

export const config = defineConfig({
	apiKey: field.secret({
		label: { en: "OMDb API key", pl: "Klucz API OMDb" },
		description: {
			en: "Free key from omdbapi.com, used to fetch IMDb metadata for movies and series.",
			pl: "Darmowy klucz z omdbapi.com, używany do pobierania danych IMDb o filmach i serialach.",
		},
		required: true,
		default: "",
	}),
	plot: field.select({
		label: { en: "Plot length", pl: "Długość opisu" },
		description: {
			en: "Whether to fetch the short or the full plot from OMDb.",
			pl: "Czy pobierać z OMDb krótki, czy pełny opis.",
		},
		options: [
			{ label: { en: "Full", pl: "Pełny" }, value: "full" },
			{ label: { en: "Short", pl: "Krótki" }, value: "short" },
		],
		default: "full",
	}),
});

export type OmdbConfig = InferConfig<typeof config>;
export type OmdbPlot = OmdbConfig["plot"];
