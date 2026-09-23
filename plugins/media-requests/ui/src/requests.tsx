import { type ReactNode, useCallback, useEffect, useState } from "react";
import type { MediaRequest, MediaRequestStatus, RequestsSummary } from "../../types";
import { createApi } from "./api";
import { EmptyState, ErrorState, Spinner } from "./components/feedback";
import { RequestRow } from "./components/request-row";
import { detach } from "./detach";
import { usePluginHost } from "./host-context";
import { getMessages, type Messages } from "./messages";

type StatusFilter = "all" | MediaRequestStatus;

const STATUS_FILTERS: StatusFilter[] = ["all", "pending", "approved", "in_progress", "available", "rejected"];

const STATUS_LABEL: Record<StatusFilter, keyof Messages> = {
	all: "all",
	pending: "pending",
	approved: "approved",
	in_progress: "inProgress",
	available: "available",
	rejected: "rejected",
};

const REQUESTS_PAGE_URL = "/plugins/org.reelvault.requests/page/discover";

export function RequestsPage() {
	const host = usePluginHost();
	const messages = getMessages(host.context.locale);
	const [api] = useState(() => createApi(host));
	const [requests, setRequests] = useState<MediaRequest[]>([]);
	const [summary, setSummary] = useState<RequestsSummary | null>(null);
	const [filter, setFilter] = useState<StatusFilter>("all");
	const [status, setStatus] = useState<"loading" | "idle" | "error">("loading");

	const load = useCallback(async (): Promise<void> => {
		setStatus("loading");
		try {
			const [list, stats] = await Promise.all([
				api.listRequests({ scope: "me", ...(filter !== "all" ? { status: filter } : {}) }),
				api.summary(),
			]);
			setRequests(list.requests);
			setSummary(stats);
			setStatus("idle");
		} catch {
			setStatus("error");
		}
	}, [api, filter]);

	useEffect(() => {
		detach(load());
	}, [load]);

	useEffect(() => {
		return host.onEvent("plugin:org.reelvault.requests:requests.changed", () => {
			detach(load());
		});
	}, [host, load]);

	const remove = async (request: MediaRequest): Promise<void> => {
		if (!window.confirm(messages.confirmRemove)) return;
		try {
			await api.deleteRequest(request.id);
			detach(load());
		} catch (error) {
			host.toast("error", error instanceof Error ? error.message : messages.actionError);
		}
	};

	const openRequest = (request: MediaRequest): void => {
		if (!(request.providerId && request.externalId)) return;
		host.navigate(
			`/plugins/org.reelvault.requests/page/detail?providerId=${encodeURIComponent(request.providerId)}&externalId=${encodeURIComponent(
				request.externalId,
			)}&mediaType=${request.mediaType}`,
		);
	};

	const renderList = (): ReactNode => {
		if (status === "loading") {
			return (
				<div className="rv-loading">
					<Spinner />
					<span>{messages.loading}</span>
				</div>
			);
		}
		if (status === "error") {
			return <ErrorState text={messages.error} retryLabel={messages.retry} onRetry={() => detach(load())} />;
		}
		if (requests.length === 0) {
			return <EmptyState text={messages.noRequests} />;
		}
		return (
			<ul className="rv-list">
				{requests.map((request) => (
					<RequestRow key={request.id} request={request} messages={messages} locale={host.context.locale} onOpen={openRequest}>
						<button type="button" className="rv-chipbtn rv-chipbtn--cancel" onClick={() => detach(remove(request))}>
							{messages.remove}
						</button>
					</RequestRow>
				))}
			</ul>
		);
	};

	return (
		<div className="rv-page">
			<header className="rv-pagetitle">
				<span className="rv-kicker">{messages.discoverKicker}</span>
				<div className="rv-titlebar">
					<h1 className="rv-display">
						{messages.myRequests}
						<span className="rv-display__accent">.</span>
					</h1>
					<button type="button" className="rv-button rv-button--outline" onClick={() => host.navigate(REQUESTS_PAGE_URL)}>
						{messages.discover}
					</button>
				</div>
			</header>

			{summary ? (
				<div className="rv-stats">
					{(
						[
							["total", messages.total, summary.total],
							["pending", messages.pending, summary.pending],
							["approved", messages.approved, summary.approved],
							["in_progress", messages.inProgress, summary.inProgress],
							["available", messages.available, summary.available],
							["rejected", messages.rejected, summary.rejected],
						] as const
					).map(([key, label, value]) => (
						<div key={key} className={`rv-stat rv-stat--${key}`}>
							<span className="rv-stat__value">{value}</span>
							<span className="rv-stat__label">{label}</span>
						</div>
					))}
				</div>
			) : null}

			<div className="rv-filterrow">
				{STATUS_FILTERS.map((value) => (
					<button
						key={value}
						type="button"
						className={`rv-chip${filter === value ? "rv-chip--active" : ""}`}
						onClick={() => setFilter(value)}
					>
						{messages[STATUS_LABEL[value]]}
					</button>
				))}
			</div>

			{renderList()}
		</div>
	);
}
