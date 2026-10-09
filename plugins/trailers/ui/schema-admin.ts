import { button, defineSchema, row, stack, stats, text, textField } from "@reelvault/sdk/ui/schema";

/** Admin panel: trailer cache stats and a tester. */
export default defineSchema({
	data: { stats: { path: "/stats" } },
	body: [
		stats([
			{ label: { en: "Cached", pl: "W pamięci" }, value: "{{data.stats.cachedCount}}", icon: "Film" },
			{ label: { en: "Movies", pl: "Filmy" }, value: "{{data.stats.moviesCount}}", icon: "Film" },
			{ label: { en: "Series", pl: "Seriale" }, value: "{{data.stats.showsCount}}", icon: "Tv" },
		]),
		stack([
			text({ en: "Trailer tester", pl: "Tester zwiastunów" }, "muted"),
			textField({
				name: "testTitle",
				label: { en: "Movie or series title", pl: "Tytuł filmu lub serialu" },
				placeholder: { en: "e.g. Inception", pl: "np. Incepcja" },
			}),
			row(
				[
					button(
						{ en: "Play trailer", pl: "Odtwórz zwiastun" },
						{ type: "openDialog", dialog: "trailer", params: { title: "{{form.testTitle}}", mediaType: "movie" } },
						{ icon: "Film" },
					),
				],
				{ align: "end" },
			),
		]),
	],
});
