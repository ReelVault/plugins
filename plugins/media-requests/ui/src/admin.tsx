import { type ReactNode, useCallback, useEffect, useState } from "react";
import type { MediaRequest, MediaRequestStatus, RequestsSummary } from "../../types";
import { createApi } from "./api";
import { EmptyState, ErrorState, Spinner } from "./components/feedback";
import { RequestRow } from "./components/request-row";
import { detach } from "./detach";
import { usePluginHost } from "./host-context";
import { getMessages, type Messages } from "./messages";

type StatusFilter = "all" | MediaRequestStatus;
type TypeFilter = "all" | "movie" | "tv_show";

const STATUS_FILTERS: StatusFilter[] = ["all", "pending", "approved", "in_progress", "available", "rejected"];
const TYPE_FILTERS: TypeFilter[] = ["all", "movie", "tv_show"];

const STATUS_LABEL: Record<StatusFilter, keyof Messages> = {
	all: "all",
	pending: "pending",
	approved: "approved",
	in_progress: "inProgress",
	available: "available",
	rejected: "rejected",
};

export function AdminPage() {
	const host = usePluginHost();
	const messages = getMessages(host.context.locale);
	const [api] = useState(() => createApi(host));
	const [requests, setRequests] = useState<MediaRequest[]>([]);
	const [summary, setSummary] = useState<RequestsSummary | null>(null);
	const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
	const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
	const [search, setSearch] = useState("");
	const [status, setStatus] = useState<"loading" | "idle" | "error">("loading");
	const [notesFor, setNotesFor] = useState<string | null>(null);

	const typeLabels: Record<TypeFilter, string> = {
		all: messages.type,
		movie: messages.movie,
		tv_show: messages.tvShow,
	};

	const load = useCallback(async (): Promise<void> => {
		setStatus("loading");
		try {
			const [list, stats] = await Promise.all([
				api.listRequests({
					scope: "all",
					...(statusFilter !== "all" ? { status: statusFilter } : {}),
					...(typeFilter !== "all" ? { mediaType: typeFilter } : {}),
				}),
				api.summary(),
			]);
			setRequests(list.requests);
			setSummary(stats);
			setStatus("idle");
		} catch {
			setStatus("error");
		}
	}, [api, statusFilter, typeFilter]);

	useEffect(() => {
		detach(load());
	}, [load]);

	useEffect(() => {
		return host.onEvent("plugin:org.reelvault.requests:requests.changed", () => {
			detach(load());
		});
	}, [host, load]);

	const setRequestStatus = async (request: MediaRequest, next: MediaRequestStatus): Promise<void> => {
		try {
			await api.updateRequest(request.id, { status: next });
			setNotesFor(null);
			detach(load());
		} catch (error) {
			host.toast("error", error instanceof Error ? error.message : messages.actionError);
		}
	};

	const saveNotes = async (request: MediaRequest, notes: string): Promise<void> => {
		try {
			await api.updateRequest(request.id, { status: request.status, notes });
			setNotesFor(null);
			detach(load());
		} catch (error) {
			host.toast("error", error instanceof Error ? error.message : messages.actionError);
		}
	};

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

	const openInLibrary = (request: MediaRequest): void => {
		if (!request.matchedMetadataId) return;
		host.navigate(`/metadata/${request.matchedMetadataId}`);
	};

	const renderRowActions = (request: MediaRequest): ReactNode => {
		const actions: ReactNode[] = [];
		if (request.status === "pending") {
			actions.push(
				<button
					key="approve"
					type="button"
					className="rv-chipbtn rv-chipbtn--approve"
					onClick={() => detach(setRequestStatus(request, "approved"))}
				>
					{messages.approve}
				</button>,
				<button
					key="reject"
					type="button"
					className="rv-chipbtn rv-chipbtn--reject"
					onClick={() => detach(setRequestStatus(request, "rejected"))}
				>
					{messages.reject}
				</button>,
			);
		}
		if (request.status === "approved") {
			actions.push(
				<button
					key="progress"
					type="button"
					className="rv-chipbtn rv-chipbtn--progress"
					onClick={() => detach(setRequestStatus(request, "in_progress"))}
				>
					{messages.markInProgress}
				</button>,
				<button
					key="available"
					type="button"
					className="rv-chipbtn rv-chipbtn--available"
					onClick={() => detach(setRequestStatus(request, "available"))}
				>
					{messages.markAvailable}
				</button>,
				<button
					key="reject"
					type="button"
					className="rv-chipbtn rv-chipbtn--reject"
					onClick={() => detach(setRequestStatus(request, "rejected"))}
				>
					{messages.reject}
				</button>,
			);
		}
		if (request.status === "in_progress") {
			actions.push(
				<button
					key="available"
					type="button"
					className="rv-chipbtn rv-chipbtn--available"
					onClick={() => detach(setRequestStatus(request, "available"))}
				>
					{messages.markAvailable}
				</button>,
				<button
					key="reject"
					type="button"
					className="rv-chipbtn rv-chipbtn--reject"
					onClick={() => detach(setRequestStatus(request, "rejected"))}
				>
					{messages.reject}
				</button>,
			);
		}
		if (request.status === "available" && request.matchedMetadataId) {
			actions.push(
				<button key="library" type="button" className="rv-chipbtn rv-chipbtn--available" onClick={() => openInLibrary(request)}>
					{messages.openInLibrary}
				</button>,
			);
		}
		actions.push(
			<button
				key="notes"
				type="button"
				className={`rv-chipbtn rv-chipbtn--cancel${request.notes ? "rv-chipbtn--noted" : ""}`}
				onClick={() => setNotesFor(notesFor === request.id ? null : request.id)}
			>
				{messages.notes}
			</button>,
			<button key="remove" type="button" className="rv-chipbtn rv-chipbtn--cancel" onClick={() => detach(remove(request))}>
				{messages.remove}
			</button>,
		);
		return actions;
	};

	const visibleRequests = (): MediaRequest[] => {
		const term = search.trim().toLowerCase();
		if (!term) return requests;
		return requests.filter(
			(request) => request.title.toLowerCase().includes(term) || (request.requestedBy.userName ?? "").toLowerCase().includes(term),
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
		const visible = visibleRequests();
		if (visible.length === 0) {
			return <EmptyState text={search ? messages.noResults : messages.noRequests} />;
		}
		return (
			<ul className="rv-list">
				{visible.map((request) => (
					<RequestRow
						key={request.id}
						request={request}
						messages={messages}
						locale={host.context.locale}
						onOpen={openRequest}
						below={
							notesFor === request.id ? (
								<NotesEditor
									request={request}
									messages={messages}
									onSave={(value) => detach(saveNotes(request, value))}
									onCancel={() => setNotesFor(null)}
								/>
							) : undefined
						}
					>
						{renderRowActions(request)}
					</RequestRow>
				))}
			</ul>
		);
	};

	return (
		<div className="rv-page">
			<header className="rv-pagetitle">
				<span className="rv-kicker">{messages.adminKicker}</span>
				<h1 className="rv-display">
					{messages.admin}
					<span className="rv-display__accent">.</span>
				</h1>
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
						key={`status-${value}`}
						type="button"
						className={`rv-chip${statusFilter === value ? "rv-chip--active" : ""}`}
						onClick={() => setStatusFilter(value)}
					>
						{messages[STATUS_LABEL[value]]}
					</button>
				))}
				<span className="rv-filterrow__divider" aria-hidden="true" />
				{TYPE_FILTERS.map((value) => (
					<button
						key={`type-${value}`}
						type="button"
						className={`rv-chip rv-chip--subtle${typeFilter === value ? "rv-chip--active" : ""}`}
						onClick={() => setTypeFilter(value)}
					>
						{typeLabels[value]}
					</button>
				))}
				<span className="rv-filterrow__divider" aria-hidden="true" />
				<input
					className="rv-input rv-filterrow__search"
					type="search"
					value={search}
					placeholder={messages.searchRequests}
					onChange={(event) => setSearch(event.target.value)}
				/>
			</div>

			{renderList()}
		</div>
	);
}

function NotesEditor({
	request,
	messages,
	onSave,
	onCancel,
}: {
	request: MediaRequest;
	messages: Messages;
	onSave: (notes: string) => void;
	onCancel: () => void;
}) {
	const [value, setValue] = useState(request.notes ?? "");

	return (
		<div className="rv-notesedit">
			<input
				className="rv-input"
				type="text"
				value={value}
				placeholder={messages.notesPlaceholder}
				onChange={(event) => setValue(event.target.value)}
			/>
			<button type="button" className="rv-chipbtn rv-chipbtn--approve" onClick={() => onSave(value.trim())}>
				{messages.save}
			</button>
			<button type="button" className="rv-chipbtn rv-chipbtn--cancel" onClick={onCancel}>
				{messages.cancel}
			</button>
		</div>
	);
}
