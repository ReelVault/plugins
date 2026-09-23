import type { MediaCard } from "../../../types";
import type { Messages } from "../messages";
import { formatVote } from "./format";
import { posterUrl } from "./poster-url";
import { StateMark } from "./state-badge";

/**
 * Poster card mirroring the host MetadataCard: 2/3 poster with hover ring,
 * title + year/rating row underneath. One stretched button opens the details;
 * the hover "Request" action is a sibling button layered above the poster, so
 * interactive elements are never nested.
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

	return (
		<div className="rv-card">
			<button
				type="button"
				className="rv-card__open"
				onClick={() => onOpen(card)}
				aria-label={`${card.title}${card.year ? ` (${card.year})` : ""} — ${messages.details}`}
			>
				<span className="rv-card__poster">
					{poster ? <img src={poster} alt="" loading="lazy" /> : <span className="rv-card__placeholder">{card.title.slice(0, 1)}</span>}
					<StateMark state={card.state} />
				</span>
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
			{requestable ? <span className="rv-card__scrim" aria-hidden="true" /> : null}
			{requestable ? (
				<button
					type="button"
					className="rv-card__request"
					title={messages.request}
					aria-label={messages.request}
					onClick={() => onRequest(card)}
				>
					<span className="rv-card__request-icon">
						<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
							<path d="M8 3v10M3 8h10" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
						</svg>
					</span>
				</button>
			) : null}
		</div>
	);
}
