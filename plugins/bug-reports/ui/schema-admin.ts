import { button, defineSchema, grid, row, selectField, stats, table, textField } from "reelvault-sdk/ui/schema";

/** Declarative admin panel: stats, filters and a reports table. */
export default defineSchema({
	data: {
		summary: { path: "/reports/summary" },
		reports: {
			path: "/reports",
			query: {
				scope: "all",
				status: "{{form.status}}",
				category: "{{form.category}}",
				severity: "{{form.severity}}",
				search: "{{form.search}}",
			},
		},
	},
	body: [
		stats([
			{ label: "Total", value: "{{data.summary.total}}" },
			{ label: "Open", value: "{{data.summary.open}}" },
			{ label: "In progress", value: "{{data.summary.inProgress}}" },
			{ label: "Resolved", value: "{{data.summary.resolved}}" },
		]),
		grid(
			[
				selectField({
					name: "status",
					label: "Status",
					default: "all",
					options: [
						{ label: "All", value: "all" },
						{ label: "Open", value: "open" },
						{ label: "In progress", value: "in_progress" },
						{ label: "Resolved", value: "resolved" },
						{ label: "Closed", value: "closed" },
						{ label: "Rejected", value: "rejected" },
					],
				}),
				selectField({
					name: "category",
					label: "Category",
					default: "all",
					options: [
						{ label: "All", value: "all" },
						{ label: "Playback", value: "playback" },
						{ label: "Metadata", value: "metadata" },
						{ label: "Subtitles", value: "subtitles" },
						{ label: "Interface", value: "ui" },
						{ label: "Performance", value: "performance" },
						{ label: "General", value: "general" },
						{ label: "Other", value: "other" },
					],
				}),
				selectField({
					name: "severity",
					label: "Severity",
					default: "all",
					options: [
						{ label: "All", value: "all" },
						{ label: "Low", value: "low" },
						{ label: "Medium", value: "medium" },
						{ label: "High", value: "high" },
						{ label: "Critical", value: "critical" },
					],
				}),
				textField({ name: "search", label: "Search" }),
			],
			{ columns: 4 },
		),
		row([button("Apply filters", { type: "refresh", sources: ["reports", "summary"] }, { variant: "outline", icon: "Search" })], {
			align: "end",
		}),
		table({
			source: "data.reports.reports",
			empty: "No reports.",
			columns: [
				{ label: "Title", value: "{{item.title}}" },
				{ label: "Category", value: "{{item.category}}", variant: "badge" },
				{ label: "Severity", value: "{{item.severity}}", variant: "badge" },
				{ label: "Status", value: "{{item.status}}", variant: "badge" },
				{ label: "Created", value: "{{item.createdAt}}", variant: "muted" },
			],
			rowActions: [
				button(
					"Manage",
					{
						type: "openDialog",
						dialog: "detail",
						params: {
							id: "{{item.id}}",
							status: "{{item.status}}",
							severity: "{{item.severity}}",
							notes: "{{item.adminNotes}}",
						},
					},
					{ variant: "outline", icon: "Settings" },
				),
			],
		}),
	],
});
