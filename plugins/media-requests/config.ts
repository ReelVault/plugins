import { defineConfig, field, type InferConfig } from "reelvault-sdk/plugin";

export const config = defineConfig({
	autoApprove: field.boolean({
		label: "Automatyczne zatwierdzanie",
		description: "Nowe prośby użytkowników są zatwierdzane automatycznie, bez udziału administratora.",
		default: false,
	}),
	notifyOnAvailable: field.boolean({
		label: "Powiadomienia o dostępności",
		description: "Wysyła powiadomienie w aplikacji, gdy żądany film lub serial trafi do biblioteki.",
		default: true,
	}),
	maxActiveRequestsPerUser: field.number({
		label: "Aktywne prośby na użytkownika",
		description: "Maksymalna liczba oczekujących, zatwierdzonych lub realizowanych próśb jednego użytkownika.",
		default: 10,
		min: 1,
		max: 100,
		step: 1,
	}),
	showDashboardSection: field.boolean({
		label: "Sekcja „Wkrótce w bibliotece”",
		description: "Wyświetla na stronie głównej sekcję z zatwierdzonymi i realizowanymi prośbami.",
		default: true,
	}),
});

export type MediaRequestsConfig = InferConfig<typeof config>;
