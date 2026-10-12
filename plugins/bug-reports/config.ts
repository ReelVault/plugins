import { defineConfig, field, type InferConfig } from "@reelvault/sdk/plugin";

export const config = defineConfig({
	notifyAdminsOnReport: field.boolean({
		label: { en: "Admin notifications", pl: "Powiadomienia dla administratorów" },
		description: {
			en: "Sends admins a notification for every newly submitted bug report.",
			pl: "Wysyła administratorom powiadomienie o każdym nowym zgłoszeniu błędu.",
		},
		default: true,
	}),
	maxActiveReportsPerUser: field.number({
		label: { en: "Active reports per user", pl: "Aktywne zgłoszenia na użytkownika" },
		description: {
			en: "Maximum number of open or in-progress reports a single user may have.",
			pl: "Maksymalna liczba otwartych lub będących w toku zgłoszeń jednego użytkownika.",
		},
		default: 20,
		min: 1,
		max: 100,
		step: 1,
	}),
	retentionDays: field.number({
		label: { en: "Closed report retention (days)", pl: "Czas przechowywania zamkniętych zgłoszeń (dni)" },
		description: {
			en: "Days after which closed or rejected reports are deleted automatically (0 = never).",
			pl: "Liczba dni, po których zamknięte lub odrzucone zgłoszenia są usuwane automatycznie (0 = nigdy).",
		},
		default: 90,
		min: 0,
		max: 365,
		step: 1,
	}),
});

export type BugReportsConfig = InferConfig<typeof config>;
