import { defineConfig, field, type InferConfig } from "@reelvault/sdk/plugin";

export const config = defineConfig({
	autoApprove: field.boolean({
		label: { en: "Automatic approval", pl: "Automatyczne zatwierdzanie" },
		description: {
			en: "Whether newly submitted segments go live in the player for everyone immediately (SponsorBlock style). Off by default — a new segment must reach the vote threshold first.",
			pl: "Czy nowe segmenty od razu trafiają do odtwarzacza dla wszystkich (w stylu SponsorBlock). Domyślnie wyłączone — nowy segment musi najpierw osiągnąć próg głosów.",
		},
		default: false,
	}),
	approvalThreshold: field.number({
		label: { en: "Approval score", pl: "Wynik potrzebny do zatwierdzenia" },
		description: {
			en: "Net score a segment needs to be approved in manual mode. The score is upvotes minus downvotes.",
			pl: "Wynik netto, jaki segment musi osiągnąć, aby zostać zatwierdzony w trybie ręcznym. Wynik to liczba głosów „za” minus liczba głosów „przeciw”.",
		},
		default: 1,
		min: 1,
		step: 1,
	}),
	rejectionThreshold: field.number({
		label: { en: "Rejection score", pl: "Wynik odrzucenia" },
		description: {
			en: "Negative score (e.g. -2) at which a segment is rejected automatically and removed from the player.",
			pl: "Ujemny wynik (np. -2), przy którym segment jest automatycznie odrzucany i usuwany z odtwarzacza.",
		},
		default: -2,
		max: -1,
		step: 1,
	}),
	downvotesToHide: field.number({
		label: { en: "Downvotes that hide a segment", pl: "Liczba głosów „przeciw”, która ukrywa segment" },
		description: {
			en: "Number of downvotes at which a segment is hidden from the player until an administrator confirms or rejects it. Administrator decisions are never changed by votes.",
			pl: "Liczba głosów „przeciw”, po której segment jest ukrywany przed odtwarzaczem, aż administrator go potwierdzi lub odrzuci. Decyzji administratora głosy nigdy nie zmieniają.",
		},
		default: 2,
		min: 1,
		max: 100,
		step: 1,
	}),
});

export type CommunityMarkersConfig = InferConfig<typeof config>;
