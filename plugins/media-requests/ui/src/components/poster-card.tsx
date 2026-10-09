import type { MediaCard } from "../../../types";
import type { Messages } from "../messages";
import { formatVote } from "./format";
import { posterUrl } from "./poster-url";
import { StateMark } from "./state-badge";

/**
 * Poster card mirroring the host MetadataCard. Two separate targets so a tap
 * never does the wrong thing:
 * - the whole card opens the details (stretched button, see `.rv-card__open`);
 * - the small "+" in the poster corner requests the title (asks for confirmation
 *   in the page, see `useConfirm`).
 * The poster itself is `pointer-events: none`, so taps on it fall through to the
 * details link; only the "+" button sits above it.
 */
export function PosterCard({
	card,
	messages,
	onOpen,
	onRequest,
}: {
	card: MediaCard;
	messages: Messages;
	onOpen: (card: MediaCard) => void;
	onRequest?: (card: MediaCard) => void;
}) {
	const poster = posterUrl(card.posterPath);
	const vote = formatVote(card.voteAverage);
	const requestable = (card.state === "none" || card.state === "rejected") && onRequest !== undefined;
	const label = `${card.title}${card.year ? ` (${card.year})` : ""}`;

	return (
		<div className="rv-card">
			<div className="rv-card__poster">
				{poster ? <img src={poster} alt="" loading="lazy" /> : <span className="rv-card__placeholder">{card.title.slice(0, 1)}</span>}
				<StateMark state={card.state} />
				{requestable ? (
					<button
						type="button"
						className="rv-card__add"
						title={messages.request}
						aria-label={`${messages.request}: ${label}`}
						onClick={() => onRequest(card)}
					>
						<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
							<path d="M8 3v10M3 8h10" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
						</svg>
					</button>
				) : null}
			</div>
			<button type="button" className="rv-card__open" onClick={() => onOpen(card)} aria-label={`${label} — ${messages.details}`}>
				<span className="rv-card__title">{card.title}</span>
				<span className="rv-card__meta">
					{card.year ? <span className="rv-card__year">{card.year}</span> : null}
					{card.year && vote ? <span className="rv-card__dot" aria-hidden="true" /> : null}
					{vote ? (
						<span className="rv-card__rating">
							<svg viewBox="0 0 24 24" width="11" height="11" aria-hidden="true">
								<path d="M12 2.5l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4l-5.9 3.1 1.2-6.5L2.5 9.4l6.6-.9z" fill="currentColor" />
							</svg>
							{vote}
						</span>
					) : null}
				</span>
			</button>
		</div>
	);
}
