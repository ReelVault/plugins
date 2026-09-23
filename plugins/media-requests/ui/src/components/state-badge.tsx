import type { MediaAvailabilityState } from "../../../types";
import type { Messages } from "../messages";

const STATE_LABEL: Record<MediaAvailabilityState, keyof Messages> = {
	available: "available",
	pending: "pending",
	approved: "approved",
	in_progress: "inProgress",
	rejected: "rejected",
	none: "none",
};

export function StateBadge({ state, messages, compact = false }: { state: MediaAvailabilityState; messages: Messages; compact?: boolean }) {
	return (
		<span className={`rv-badge rv-badge--${state}`} data-compact={compact || undefined}>
			{messages[STATE_LABEL[state]]}
		</span>
	);
}

function CheckIcon() {
	return (
		<svg viewBox="0 0 16 16" width="10" height="10" aria-hidden="true">
			<path d="M3 8.5 6.5 12 13 4.5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
		</svg>
	);
}

function ClockIcon() {
	return (
		<svg viewBox="0 0 16 16" width="10" height="10" aria-hidden="true">
			<circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeWidth="1.8" />
			<path d="M8 4.8V8l2.4 1.6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
		</svg>
	);
}

function ProgressIcon() {
	return (
		<svg viewBox="0 0 16 16" width="10" height="10" aria-hidden="true">
			<path
				d="M8 2.5v7M5 6.5l3 3 3-3M3 13h10"
				fill="none"
				stroke="currentColor"
				strokeWidth="1.8"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
		</svg>
	);
}

function RejectIcon() {
	return (
		<svg viewBox="0 0 16 16" width="10" height="10" aria-hidden="true">
			<path d="M4.5 4.5 11.5 11.5 M11.5 4.5 4.5 11.5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
		</svg>
	);
}

/**
 * Compact poster-corner mark for the request/library state, colored with the
 * matching host status token. Rendered as a small rounded square so it reads
 * at poster scale.
 */
export function StateMark({ state }: { state: MediaAvailabilityState }) {
	if (state === "none") return null;
	if (state === "available") {
		return (
			<span className="rv-statement rv-statement--available">
				<CheckIcon />
			</span>
		);
	}
	if (state === "in_progress") {
		return (
			<span className="rv-statement rv-statement--in_progress">
				<ProgressIcon />
			</span>
		);
	}
	if (state === "pending" || state === "approved") {
		return (
			<span className={`rv-statement rv-statement--${state}`}>
				<ClockIcon />
			</span>
		);
	}
	return (
		<span className="rv-statement rv-statement--rejected">
			<RejectIcon />
		</span>
	);
}

export function stateMessage(state: MediaAvailabilityState, messages: Messages): string {
	return messages[STATE_LABEL[state]];
}
