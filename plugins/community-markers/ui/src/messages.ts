import type { SegmentStatus, SegmentType } from "./types";

export interface Messages {
	loading: string;
	noMediaPlaying: string;
	noSegments: string;
	noMarkers: string;
	segmentCount: (count: number) => string;
	markersTab: (count: number) => string;
	score: (value: number) => string;
	status: string;
	statusAll: string;
	type: string;
	segmentType: string;
	label: string;
	descriptionOptional: string;
	startSeconds: string;
	endSeconds: string;
	time: string;
	now: string;
	play: string;
	edit: string;
	editSegment: string;
	delete: string;
	cancel: string;
	save: string;
	saving: string;
	confirm: string;
	reject: string;
	reportNew: string;
	submitMarker: string;
	submitting: string;
	endAfterStart: string;
	hiddenHint: string;
	loadFailed: string;
	submitFailed: string;
	voteFailed: string;
	deleteFailed: string;
	updateFailed: string;
	markerSubmitted: string;
	markerRemoved: string;
	segmentDeleted: string;
	segmentUpdated: string;
	statuses: Record<SegmentStatus, string>;
	types: Record<SegmentType, string>;
	/** Server error codes (the `code` of a failed request) mapped to readable text. */
	errors: Record<string, string>;
}

const EN: Messages = {
	loading: "Loading…",
	noMediaPlaying: "No media file is playing.",
	noSegments: "No segments.",
	noMarkers: "No community markers for this video yet.",
	segmentCount: (count) => `Segments: ${count}`,
	markersTab: (count) => `Markers (${count})`,
	score: (value) => `Score: ${value}`,
	status: "Status",
	statusAll: "All",
	type: "Type",
	segmentType: "Segment type",
	label: "Label",
	descriptionOptional: "Description (optional)",
	startSeconds: "Start (seconds)",
	endSeconds: "End (seconds)",
	time: "Time (seconds)",
	now: "Now",
	play: "Play",
	edit: "Edit",
	editSegment: "Edit segment",
	delete: "Delete",
	cancel: "Cancel",
	save: "Save",
	saving: "Saving…",
	confirm: "Confirm",
	reject: "Reject",
	reportNew: "Report new",
	submitMarker: "Submit marker",
	submitting: "Submitting…",
	endAfterStart: "The end time must be after the start time.",
	hiddenHint: "Hidden from other viewers until an administrator decides.",
	loadFailed: "Could not load the segments.",
	submitFailed: "Could not submit the marker.",
	voteFailed: "Could not record the vote.",
	deleteFailed: "Could not delete the segment.",
	updateFailed: "Could not save the segment.",
	markerSubmitted: "Marker submitted",
	markerRemoved: "Marker removed",
	segmentDeleted: "Segment deleted",
	segmentUpdated: "Segment updated",
	statuses: { pending: "Pending", approved: "Approved", rejected: "Rejected", hidden: "Hidden" },
	types: { intro: "Intro", credits: "Credits", recap: "Recap", chapter: "Chapter", highlight: "Highlight" },
	errors: {
		"segment.media_required": "The media file is missing.",
		"segment.invalid": "The segment details are not valid.",
		"segment.media_not_found": "This media file is not in the library.",
		"segment.range_invalid": "The end time must be after the start time.",
		"segment.storage_full": "The segment could not be saved. Try again later.",
		"segment.vote_params_required": "The vote is missing required details.",
		"segment.params_required": "The request is missing required details.",
		"segment.not_found": "The segment was not found.",
		"segment.forbidden": "You can only delete markers you submitted.",
		"segment.locked": "An administrator has decided on this segment, so it can no longer be removed.",
	},
};

const PL: Messages = {
	loading: "Wczytywanie…",
	noMediaPlaying: "Nie odtwarzasz żadnego pliku.",
	noSegments: "Brak segmentów.",
	noMarkers: "Brak znaczników społeczności dla tego wideo.",
	segmentCount: (count) => `Segmentów: ${count}`,
	markersTab: (count) => `Znaczniki (${count})`,
	score: (value) => `Wynik: ${value}`,
	status: "Status",
	statusAll: "Wszystkie",
	type: "Typ",
	segmentType: "Typ segmentu",
	label: "Etykieta",
	descriptionOptional: "Opis (opcjonalnie)",
	startSeconds: "Początek (sekundy)",
	endSeconds: "Koniec (sekundy)",
	time: "Czas (sekundy)",
	now: "Teraz",
	play: "Odtwórz",
	edit: "Edytuj",
	editSegment: "Edytuj segment",
	delete: "Usuń",
	cancel: "Anuluj",
	save: "Zapisz",
	saving: "Zapisywanie…",
	confirm: "Potwierdź",
	reject: "Odrzuć",
	reportNew: "Zgłoś nowy",
	submitMarker: "Zgłoś znacznik",
	submitting: "Zgłaszanie…",
	endAfterStart: "Koniec musi być później niż początek.",
	hiddenHint: "Ukryty dla innych widzów, dopóki administrator nie podejmie decyzji.",
	loadFailed: "Nie udało się wczytać segmentów.",
	submitFailed: "Nie udało się zgłosić znacznika.",
	voteFailed: "Nie udało się oddać głosu.",
	deleteFailed: "Nie udało się usunąć segmentu.",
	updateFailed: "Nie udało się zapisać segmentu.",
	markerSubmitted: "Znacznik zgłoszony",
	markerRemoved: "Znacznik usunięty",
	segmentDeleted: "Segment usunięty",
	segmentUpdated: "Segment zapisany",
	statuses: { pending: "Oczekuje", approved: "Zatwierdzony", rejected: "Odrzucony", hidden: "Ukryty" },
	types: { intro: "Intro", credits: "Napisy końcowe", recap: "Podsumowanie", chapter: "Rozdział", highlight: "Wyróżnienie" },
	errors: {
		"segment.media_required": "Brakuje pliku multimedialnego.",
		"segment.invalid": "Dane segmentu są nieprawidłowe.",
		"segment.media_not_found": "Tego pliku nie ma w bibliotece.",
		"segment.range_invalid": "Koniec musi być później niż początek.",
		"segment.storage_full": "Nie udało się zapisać segmentu. Spróbuj ponownie później.",
		"segment.vote_params_required": "Brakuje danych głosu.",
		"segment.params_required": "Brakuje wymaganych danych.",
		"segment.not_found": "Nie znaleziono segmentu.",
		"segment.forbidden": "Możesz usuwać tylko własne znaczniki.",
		"segment.locked": "Administrator rozstrzygnął ten segment, więc nie można go już usunąć.",
	},
};

export function getMessages(locale: string): Messages {
	return locale.toLowerCase().startsWith("pl") ? PL : EN;
}

/** Readable text for a failed request: a known server code is translated, anything else gets the fallback. */
export function errorText(messages: Messages, error: unknown, fallback: string): string {
	const code = error instanceof Error && "code" in error && typeof error.code === "string" ? error.code : undefined;
	if (code === undefined || !Object.hasOwn(messages.errors, code)) return fallback;

	return messages.errors[code] ?? fallback;
}
