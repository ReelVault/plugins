import { button, defineSchema, row, stats, table } from "reelvault-sdk/ui/schema";

/** Admin panel: delivery stats, test/clear actions and the delivery log. */
export default defineSchema({
	data: {
		status: { path: "/status" },
		history: { path: "/history" },
	},
	body: [
		stats([
			{ label: { en: "Deliveries", pl: "Dostawy" }, value: "{{data.status.statistics.totalDeliveries}}", icon: "Send" },
			{ label: { en: "Successful", pl: "Udane" }, value: "{{data.status.statistics.successfulDeliveries}}" },
			{ label: { en: "Failed", pl: "Nieudane" }, value: "{{data.status.statistics.failedDeliveries}}" },
		]),
		row(
			[
				button(
					{ en: "Send test notification", pl: "Wyślij powiadomienie testowe" },
					{
						type: "call",
						path: "/test",
						method: "POST",
						successToast: { en: "Test notification sent", pl: "Powiadomienie testowe wysłane" },
						refresh: ["status", "history"],
					},
					{ icon: "Send" },
				),
				button(
					{ en: "Clear history", pl: "Wyczyść historię" },
					{
						type: "call",
						path: "/clear-history",
						method: "POST",
						confirm: { en: "Clear the delivery history?", pl: "Wyczyścić historię dostaw?" },
						successToast: { en: "History cleared", pl: "Historia wyczyszczona" },
						refresh: ["history"],
					},
					{ variant: "ghost", icon: "Flag" },
				),
			],
			{ align: "end" },
		),
		table({
			source: "data.history.history",
			empty: { en: "No deliveries yet.", pl: "Brak dostaw." },
			columns: [
				{ label: { en: "Title", pl: "Tytuł" }, value: "{{item.title}}" },
				{ label: { en: "Target", pl: "Cel" }, value: "{{item.target}}", variant: "badge" },
				{ label: { en: "Event", pl: "Zdarzenie" }, value: "{{item.event}}", variant: "muted" },
				{ label: { en: "Success", pl: "Sukces" }, value: "{{item.success}}", variant: "badge" },
				{ label: { en: "At", pl: "Kiedy" }, value: "{{item.timestamp}}", variant: "muted" },
			],
		}),
	],
});
