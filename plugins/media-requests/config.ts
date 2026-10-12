import { defineConfig, field, type InferConfig } from "@reelvault/sdk/plugin";

export const config = defineConfig({
	autoApprove: field.boolean({
		label: { en: "Automatic approval", pl: "Automatyczne zatwierdzanie" },
		description: {
			en: "New user requests are approved automatically, without an administrator.",
			pl: "Nowe prośby użytkowników są zatwierdzane automatycznie, bez udziału administratora.",
		},
		default: false,
	}),
	notifyOnAvailable: field.boolean({
		label: { en: "Availability notifications", pl: "Powiadomienia o dostępności" },
		description: {
			en: "Sends an in-app notification when a requested movie or series arrives in the library.",
			pl: "Wysyła powiadomienie w aplikacji, gdy żądany film lub serial trafi do biblioteki.",
		},
		default: true,
	}),
	maxActiveRequestsPerUser: field.number({
		label: { en: "Active requests per user", pl: "Aktywne prośby na użytkownika" },
		description: {
			en: "Maximum number of pending, approved or in-progress requests a single user may have.",
			pl: "Maksymalna liczba oczekujących, zatwierdzonych lub realizowanych próśb jednego użytkownika.",
		},
		default: 10,
		min: 1,
		max: 100,
		step: 1,
	}),
	showDashboardSection: field.boolean({
		label: { en: "Coming soon section", pl: "Sekcja „Wkrótce w bibliotece”" },
		description: {
			en: "Shows approved and in-progress requests on the home page.",
			pl: "Wyświetla na stronie głównej sekcję z zatwierdzonymi i realizowanymi prośbami.",
		},
		default: true,
	}),
});

export type MediaRequestsConfig = InferConfig<typeof config>;
