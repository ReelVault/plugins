import { button, defineSchema, embed, stack, text, when } from "@reelvault/sdk/ui/schema";

/** Trailer dialog: fetch the trailer for the current title and embed it. */
export default defineSchema({
	data: {
		trailer: {
			path: "/trailer",
			query: {
				metadataId: "{{context.params.metadataId}}",
				title: "{{context.params.title}}",
				mediaType: "{{context.params.mediaType}}",
				tmdbId: "{{context.params.tmdbId}}",
				year: "{{context.params.year}}",
			},
		},
	},
	body: [
		when({ left: "data.trailer.found", op: "truthy" }, [
			embed("https://www.youtube-nocookie.com/embed/{{data.trailer.trailerKey}}?autoplay=1&rel=0&modestbranding=1", {
				title: { en: "Trailer", pl: "Zwiastun" },
			}),
		]),
		when({ left: "data.trailer.found", op: "falsy" }, [
			stack([
				text({ en: "No trailer is available for this title.", pl: "Brak zwiastuna dla tego tytułu." }, "muted"),
				button({ en: "Close", pl: "Zamknij" }, { type: "close" }, { variant: "outline" }),
			]),
		]),
	],
});
