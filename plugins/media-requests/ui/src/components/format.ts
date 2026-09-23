/** Formats an ISO date (or date-ish string) in the host locale; falls back to the raw value. */
export function formatDate(value: string | undefined, locale: string): string | undefined {
	if (!value) return undefined;
	const parsed = new Date(value);
	if (Number.isNaN(parsed.getTime())) return value;
	return new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(parsed);
}

export function formatVote(vote: number | undefined): string | undefined {
	return typeof vote === "number" && vote > 0 ? vote.toFixed(1) : undefined;
}

/** Deterministic hue for a genre id, used for tile tints (no provider palette needed). */
export function genreHue(id: string): number {
	let hash = 0;
	for (let index = 0; index < id.length; index += 1) {
		hash = (hash * 31 + id.charCodeAt(index)) % 360;
	}
	return hash;
}

/** „3 dni temu"-style relative time for request rows; falls back to the absolute date. */
export function formatRelative(value: string | undefined, locale: string): string | undefined {
	if (!value) return undefined;
	const parsed = new Date(value);
	if (Number.isNaN(parsed.getTime())) return value;

	const diffMs = Date.now() - parsed.getTime();
	const diffMinutes = Math.round(diffMs / 60000);
	const formatter = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
	if (Math.abs(diffMinutes) < 60) return formatter.format(-diffMinutes, "minute");
	const diffHours = Math.round(diffMinutes / 60);
	if (Math.abs(diffHours) < 24) return formatter.format(-diffHours, "hour");
	const diffDays = Math.round(diffHours / 24);
	if (Math.abs(diffDays) < 30) return formatter.format(-diffDays, "day");
	return formatDate(value, locale);
}
