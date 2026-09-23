import type { MediaRequest, MediaRequestStatus } from "../../../types";
import type { Messages } from "../messages";
import { formatRelative } from "./format";
import { posterUrl } from "./poster-url";
import { StateBadge } from "./state-badge";

/**
 * Wide card for the "Recent requests" shelf: poster thumbnail with title,
 * status and inline management actions (cancel; approve/reject for pending
 * requests when the viewer is an admin).
 */
export function RequestCard({
	request,
	messages,
	locale,
	isAdmin,
	userId,
	onOpen,
	onCancel,
	onStatus,
}: {
	request: MediaRequest;
	messages: Messages;
	locale: string;
	isAdmin: boolean;
	userId: string | undefined;
	onOpen: (request: MediaRequest) => void;
	onCancel: (request: MediaRequest) => void;
	onStatus: (request: MediaRequest, status: MediaRequestStatus) => void;
}) {
	const poster = posterUrl(request.posterPath);
	const own = userId !== undefined && request.requestedBy.userId === userId;
	const canModerate = isAdmin && request.status === "pending";
	const canCancel = own || isAdmin;

	return (
		<article className="rv-reqcard">
			<button type="button" className="rv-reqcard__poster" onClick={() => onOpen(request)} aria-label={request.title}>
				{poster ? <img src={poster} alt="" loading="lazy" /> : <span className="rv-reqcard__placeholder">{request.title.slice(0, 1)}</span>}
			</button>
			<div className="rv-reqcard__body">
				<button type="button" className="rv-reqcard__title" onClick={() => onOpen(request)} title={request.title}>
					{request.title}
				</button>
				<div className="rv-reqcard__meta">
					{request.year ? <span>{request.year}</span> : null}
					<span>{request.mediaType === "tv_show" ? messages.tvShow : messages.movie}</span>
					<StateBadge state={request.status} messages={messages} compact />
				</div>
				<div className="rv-reqcard__by">
					{request.requestedBy.userName ?? "—"} · {formatRelative(request.createdAt, locale)}
				</div>
				{canModerate || canCancel ? (
					<div className="rv-reqcard__actions">
						{canModerate ? (
							<>
								<button type="button" className="rv-chipbtn rv-chipbtn--approve" onClick={() => onStatus(request, "approved")}>
									{messages.approve}
								</button>
								<button type="button" className="rv-chipbtn rv-chipbtn--reject" onClick={() => onStatus(request, "rejected")}>
									{messages.reject}
								</button>
							</>
						) : null}
						{canCancel ? (
							<button type="button" className="rv-chipbtn rv-chipbtn--cancel" onClick={() => onCancel(request)}>
								{messages.cancel}
							</button>
						) : null}
					</div>
				) : null}
			</div>
		</article>
	);
}
