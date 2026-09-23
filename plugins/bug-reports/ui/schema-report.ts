import {
	button,
	defineSchema,
	grid,
	row,
	selectField,
	stack,
	switchField,
	text,
	textareaField,
	textField,
	when,
} from "@reelvault/sdk/ui/schema";

/**
 * "Report a bug" dialog: only the title shows first; the rest expands under
 * "show more". Page URL and device/browser context are captured automatically.
 */
export default defineSchema({
	body: [
		stack([
			text(
				{
					en: "Describe the problem you ran into. Logs help a lot if you can attach them.",
					pl: "Opisz napotkany problem. Logi bardzo pomagają, jeśli możesz je dołączyć.",
				},
				"muted",
			),
			textField({
				name: "title",
				label: { en: "Title", pl: "Tytuł" },
				placeholder: { en: "Short summary", pl: "Krótkie podsumowanie" },
				required: true,
			}),
			switchField({ name: "more", label: { en: "Show more options", pl: "Pokaż więcej opcji" }, default: false }),
			when({ left: "form.more", op: "truthy" }, [
				grid(
					[
						selectField({
							name: "category",
							label: { en: "Category", pl: "Kategoria" },
							default: "general",
							options: [
								{ label: { en: "Playback", pl: "Odtwarzanie" }, value: "playback" },
								{ label: { en: "Metadata", pl: "Metadane" }, value: "metadata" },
								{ label: { en: "Subtitles", pl: "Napisy" }, value: "subtitles" },
								{ label: { en: "Interface", pl: "Interfejs" }, value: "ui" },
								{ label: { en: "Performance", pl: "Wydajność" }, value: "performance" },
								{ label: { en: "General", pl: "Ogólne" }, value: "general" },
								{ label: { en: "Other", pl: "Inne" }, value: "other" },
							],
						}),
						selectField({
							name: "severity",
							label: { en: "Severity", pl: "Ważność" },
							default: "medium",
							options: [
								{ label: { en: "Low", pl: "Niska" }, value: "low" },
								{ label: { en: "Medium", pl: "Średnia" }, value: "medium" },
								{ label: { en: "High", pl: "Wysoka" }, value: "high" },
								{ label: { en: "Critical", pl: "Krytyczna" }, value: "critical" },
							],
						}),
					],
					{ columns: 2 },
				),
				textareaField({ name: "description", label: { en: "Description (optional)", pl: "Opis (opcjonalnie)" }, rows: 5 }),
				// English-only label — falls back to the plugin default locale.
				textareaField({ name: "logs", label: { en: "Logs (optional)" }, rows: 4 }),
			]),
			row(
				[
					button({ en: "Cancel", pl: "Anuluj" }, { type: "close" }, { variant: "ghost" }),
					button(
						{ en: "Submit report", pl: "Wyślij zgłoszenie" },
						{
							type: "submit",
							path: "/reports",
							body: {
								title: "{{form.title}}",
								category: "{{form.category}}",
								severity: "{{form.severity}}",
								description: "{{form.description}}",
								logs: "{{form.logs}}",
								pageUrl: "{{context.pageUrl}}",
								deviceInfo: {
									userAgent: "{{context.device.userAgent}}",
									language: "{{context.device.language}}",
									screenResolution: "{{context.device.screenResolution}}",
									browser: "{{context.device.browser}}",
									os: "{{context.device.os}}",
								},
							},
							successToast: { en: "Report submitted", pl: "Zgłoszenie wysłane" },
							close: true,
						},
					),
				],
				{ align: "end", gap: 2 },
			),
		]),
	],
});
