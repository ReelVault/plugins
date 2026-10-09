import { button, defineSchema, grid, heading, row, selectField, text, textareaField } from "@reelvault/sdk/ui/schema";

/**
 * "Manage" dialog opened from the admin reports table: shows the report and
 * lets an admin update its status, severity and internal notes. The row action
 * passes only the report id — the rest comes from `GET /reports/item/:id`.
 */
export default defineSchema({
	data: {
		report: { path: "/reports/item/{{context.params.id}}" },
	},
	body: [
		heading("{{data.report.report.title}}"),
		text("{{data.report.report.description}}", "muted"),
		text(
			{
				en: "Reported by: {{data.report.report.reportedBy.userId}}",
				pl: "Zgłosił: {{data.report.report.reportedBy.userId}}",
			},
			"muted",
		),
		text({ en: "Page: {{data.report.report.pageUrl}}", pl: "Strona: {{data.report.report.pageUrl}}" }, "muted"),
		text(
			{
				en: "Device: {{data.report.report.deviceInfo.browser}} · {{data.report.report.deviceInfo.os}}",
				pl: "Urządzenie: {{data.report.report.deviceInfo.browser}} · {{data.report.report.deviceInfo.os}}",
			},
			"muted",
		),
		grid(
			[
				selectField({
					name: "status",
					label: { en: "Status", pl: "Status" },
					default: "{{data.report.report.status}}",
					options: [
						{ label: { en: "Open", pl: "Otwarte" }, value: "open" },
						{ label: { en: "In progress", pl: "W toku" }, value: "in_progress" },
						{ label: { en: "Resolved", pl: "Rozwiązane" }, value: "resolved" },
						{ label: { en: "Closed", pl: "Zamknięte" }, value: "closed" },
						{ label: { en: "Rejected", pl: "Odrzucone" }, value: "rejected" },
					],
				}),
				selectField({
					name: "severity",
					label: { en: "Severity", pl: "Ważność" },
					default: "{{data.report.report.severity}}",
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
		textareaField({
			name: "adminNotes",
			label: { en: "Admin notes", pl: "Notatki administratora" },
			default: "{{data.report.report.adminNotes}}",
		}),
		row(
			[
				button(
					{ en: "Delete", pl: "Usuń" },
					{
						type: "call",
						method: "DELETE",
						path: "/reports/{{context.params.id}}",
						confirm: { en: "Delete this report permanently?", pl: "Usunąć to zgłoszenie na stałe?" },
						successToast: { en: "Report deleted", pl: "Zgłoszenie usunięte" },
						close: true,
						refresh: ["reports", "summary"],
					},
				),
				button(
					{ en: "Save", pl: "Zapisz" },
					{
						type: "submit",
						method: "PATCH",
						path: "/reports/{{context.params.id}}",
						successToast: { en: "Report updated", pl: "Zgłoszenie zaktualizowane" },
						close: true,
						refresh: ["reports", "summary"],
					},
				),
			],
			{ align: "end" },
		),
	],
});
