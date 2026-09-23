import type { ReactNode } from "react";
import type { MediaRequest } from "../../../types";
import type { Messages } from "../messages";
import { formatRelative } from "./format";
import { posterUrl } from "./poster-url";
import { StateBadge } from "./state-badge";

function RowPoster({ request, onOpen }: { request: MediaRequest; onOpen?: (request: MediaRequest) => void }) {
	const poster = posterUrl(request.posterPath);

	if (onOpen) {
		return (
			<button
				type="button"
				className="rv-listrow__poster rv-listrow__poster--button"
				onClick={() => onOpen(request)}
				aria-label={request.title}
			>
				{poster ? <img src={poster} alt="" loading="lazy" /> : <span className="rv-listrow__letter">{request.title.slice(0, 1)}</span>}
			</button>
		);
	}
	if (poster) return <img className="rv-listrow__poster" src={poster} alt="" loading="lazy" />;
	return <span className="rv-listrow__poster" />;
}

function RowTitle({ request, onOpen }: { request: MediaRequest; onOpen?: (request: MediaRequest) => void }) {
	const year = request.year ? <span className="rv-listrow__year"> ({request.year})</span> : null;

	if (onOpen) {
		return (
			<button type="button" className="rv-listrow__title rv-listrow__title--button" onClick={() => onOpen(request)}>
				{request.title}
				{year}
			</button>
		);
	}
	return (
		<span className="rv-listrow__title">
			{request.title}
			{year}
		</span>
	);
}

/** Row used by the user requests page and the admin panel. */
export function RequestRow({
	request,
	messages,
	locale,
	onOpen,
	below,
	children,
}: {
	request: MediaRequest;
	messages: Messages;
	locale: string;
	onOpen?: (request: MediaRequest) => void;
	/** Full-width block rendered under the row (e.g. the admin notes editor). */
	below?: ReactNode;
	children?: ReactNode;
}) {
	return (
		<li className="rv-listrow">
			<div className="rv-listrow__main">
				<RowPoster request={request} onOpen={onOpen} />
				<div className="rv-listrow__info">
					<RowTitle request={request} onOpen={onOpen} />
					<span className="rv-listrow__meta">
						<span className={`rv-typetag rv-typetag--${request.mediaType === "tv_show" ? "tv" : "movie"}`}>
							{request.mediaType === "tv_show" ? messages.tvShow : messages.movie}
						</span>
						{request.requestedBy.userName ? <span>{request.requestedBy.userName}</span> : null}
						<span>{formatRelative(request.createdAt, locale)}</span>
					</span>
					{request.notes ? <span className="rv-listrow__notes">{request.notes}</span> : null}
				</div>
				<StateBadge state={request.status} messages={messages} />
				{children ? <div className="rv-listrow__actions">{children}</div> : null}
			</div>
			{below ? <div className="rv-listrow__below">{below}</div> : null}
		</li>
	);
}
