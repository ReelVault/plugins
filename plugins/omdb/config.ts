import { defineConfig, field, type InferConfig } from "@reelvault/sdk/plugin";

export const config = defineConfig({
	apiKey: field.secret({
		label: "OMDb API key",
		description: "Free key from omdbapi.com, used to fetch IMDb metadata for movies and series.",
		required: true,
		default: "",
	}),
	plot: field.select({
		label: "Plot length",
		description: "Whether to fetch the short or the full plot from OMDb.",
		options: [
			{ label: "Full", value: "full" },
			{ label: "Short", value: "short" },
		],
		default: "full",
	}),
});

export type OmdbConfig = InferConfig<typeof config>;
export type OmdbPlot = OmdbConfig["plot"];
