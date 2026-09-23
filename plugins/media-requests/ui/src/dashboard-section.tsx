import { useCallback, useEffect, useState } from "react";
import type { MediaRequest } from "../../types";
import { createApi } from "./api";
import { SkeletonRow } from "./components/feedback";
import { posterUrl } from "./components/poster-url";
import { CarouselRow } from "./components/shelf";
import { StateBadge } from "./components/state-badge";
import { detach } from "./detach";
import { usePluginHost } from "./host-context";
import { getMessages, type Messages } from "./messages";

const REQUESTS_EVENT = "plugin:org.reelvault.requests:requests.changed";

function detailPageUrl(providerId: string, externalId: string, mediaType: string): string {
	return `/plugins/org.reelvault.requests/page/detail?providerId=${encodeURIComponent(providerId)}&externalId=${encodeURIComponent(
		externalId,
	)}&mediaType=${mediaType}`;
}

function KickerIcon() {
	return (
		<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
			<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="2" />
			<path d="M12 7v5l3.5 2.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
		</svg>
	);
}

/**
 * Poster card for a request, mirroring the host MetadataCard layout. Clicking
 * opens the plugin details page when the request carries provider ids.
 */
function ComingSoonCard({
	request,
	messages,
	openable,
	onOpen,
}: {
	request: MediaRequest;
	messages: Messages;
	openable: boolean;
	onOpen: (request: MediaRequest) => void;
}) {
	const poster = posterUrl(request.posterPath);

	const body = (
		<>
			<span className="rv-card__poster">
				{poster ? <img src={poster} alt="" loading="lazy" /> : <span className="rv-card__placeholder">{request.title.slice(0, 1)}</span>}
			</span>
			<span className="rv-card__title">{request.title}</span>
			<span className="rv-card__meta">
				{request.year ? <span className="rv-card__year">{request.year}</span> : null}
				<StateBadge state={request.status} messages={messages} compact />
			</span>
		</>
	);

	if (!openable) return <div className="rv-card">{body}</div>;
	return (
		<button type="button" className="rv-card" onClick={() => onOpen(request)} aria-label={request.title}>
			{body}
		</button>
	);
}

/**
 * Dashboard slot section ("Coming soon to your library"): approved and
 * in-progress requests from all users, in the host's section-title style.
 * Renders nothing when disabled, empty, or on failure so an unused slot costs
 * the dashboard nothing.
 */
export function DashboardComingSoon() {
	const host = usePluginHost();
	const messages = getMessages(host.context.locale);
	const [api] = useState(() => createApi(host));
	const [items, setItems] = useState<MediaRequest[] | null>(null);
	const [hidden, setHidden] = useState(false);

	const load = useCallback(async (): Promise<void> => {
		try {
			const result = await api.comingSoon();
			if (!result.enabled || result.items.length === 0) {
				setHidden(true);
				setItems([]);
				return;
			}
			setHidden(false);
			setItems(result.items);
		} catch {
			setHidden(true);
		}
	}, [api]);

	useEffect(() => {
		detach(load());
	}, [load]);

	useEffect(() => {
		return host.onEvent(REQUESTS_EVENT, () => {
			detach(load());
		});
	}, [host, load]);

	if (hidden) return null;

	const openRequest = (request: MediaRequest): void => {
		if (!(request.providerId && request.externalId)) return;
		host.navigate(detailPageUrl(request.providerId, request.externalId, request.mediaType));
	};

	return (
		<section className="rv-dash">
			<header className="rv-dash__head">
				<span className="rv-dash__kicker">
					<KickerIcon />
					{messages.comingSoonKicker}
				</span>
				<h2 className="rv-dash__title">
					{messages.comingSoonTitle} <span className="rv-dash__gradient">{messages.comingSoonSubtitle}</span>
				</h2>
			</header>
			{items === null ? (
				<SkeletonRow />
			) : (
				<CarouselRow>
					{items.map((request) => (
						<ComingSoonCard
							key={request.id}
							request={request}
							messages={messages}
							openable={Boolean(request.providerId && request.externalId)}
							onOpen={openRequest}
						/>
					))}
				</CarouselRow>
			)}
		</section>
	);
}
