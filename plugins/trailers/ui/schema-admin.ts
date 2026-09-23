import { button, defineSchema, row, stack, stats, text, textField } from "@reelvault/sdk/ui/schema";

/** Admin panel: trailer cache stats, bulk cache and a tester. */
export default defineSchema({
	data: { stats: { path: "/stats" } },
	body: [
		stats([
			{ label: { en: "Cached", pl: "W pamięci" }, value: "{{data.stats.cachedCount}}", icon: "Film" },
			{ label: { en: "Movies", pl: "Filmy" }, value: "{{data.stats.moviesCount}}", icon: "Film" },
			{ label: { en: "Series", pl: "Seriale" }, value: "{{data.stats.showsCount}}", icon: "Tv" },
		]),
		row(
			[
				button(
					{ en: "Cache all trailers", pl: "Zbuforuj wszystkie zwiastuny" },
					{
						type: "call",
						path: "/cache-all",
						method: "POST",
						successToast: { en: "Trailer sync finished", pl: "Synchronizacja zwiastunów zakończona" },
						refresh: ["stats"],
					},
					{ icon: "Zap" },
				),
			],
			{ align: "end" },
		),
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
