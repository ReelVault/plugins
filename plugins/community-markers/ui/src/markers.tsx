import { type ReactNode, type SyntheticEvent, useCallback, useEffect, useState } from "react";
import { detach } from "./detach";
import { usePluginHost } from "./host-context";
import { errorText, getMessages } from "./messages";
import type { PublicSegment, SegmentType } from "./types";

const TYPES: SegmentType[] = ["intro", "credits", "recap", "chapter", "highlight"];
const SEGMENT_TYPES: ReadonlySet<string> = new Set(TYPES);

function isSegmentType(value: string): value is SegmentType {
	return SEGMENT_TYPES.has(value);
}

function formatTime(seconds: number): string {
	const total = Math.max(0, Math.floor(seconds));
	const h = Math.floor(total / 3600);
	const m = Math.floor((total % 3600) / 60);
	const s = total % 60;
	const mm = String(m).padStart(2, "0");
	const ss = String(s).padStart(2, "0");
	return h > 0 ? `${h}:${mm}:${ss}` : `${m}:${ss}`;
}

export function CommunityMarkersDialog() {
	const host = usePluginHost();
	const messages = getMessages(host.context.locale);
	const [mediaFileId, setMediaFileId] = useState("");
	const [segments, setSegments] = useState<PublicSegment[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState("");
	const [tab, setTab] = useState<"list" | "create">("list");

	const [type, setType] = useState<SegmentType>("intro");
	const [start, setStart] = useState(0);
	const [end, setEnd] = useState(0);
	const [label, setLabel] = useState("");
	const [busy, setBusy] = useState(false);

	const load = useCallback(
		async (fileId: string): Promise<void> => {
			if (!fileId) {
				setLoading(false);
				setError(messages.noMediaPlaying);
				return;
			}
			try {
				const result = await host.api.call<PublicSegment[]>("/segments", { query: { mediaFileId: fileId } });
				setSegments(result);
				setError("");
			} catch (err) {
				setError(errorText(messages, err, messages.loadFailed));
			} finally {
				setLoading(false);
			}
		},
		[host, messages],
	);

	useEffect(() => {
		const context = host.context;
		const fileId = context.player?.mediaFileId ?? context.params.mediaFileId ?? "";
		setMediaFileId(fileId);
		detach(load(fileId));
		return host.onContext((next) => {
			const nextFileId = next.player?.mediaFileId ?? next.params.mediaFileId ?? "";
			setMediaFileId(nextFileId);
		});
	}, [host, load]);

	const pickNow = (target: "start" | "end"): void => {
		const state = host.getPlayerState();
		const current = Math.round((state.currentTime ?? 0) * 10) / 10;
		if (target === "start") {
			setStart(current);
			if (type === "highlight") setEnd(current);
		} else {
			setEnd(current);
		}
	};

	const submit = async (event: SyntheticEvent): Promise<void> => {
		event.preventDefault();
		const effectiveEnd = type === "highlight" ? start : end;
		if (type !== "highlight" && effectiveEnd <= start) {
			setError(messages.endAfterStart);
			return;
		}
		setBusy(true);
		try {
			await host.api.call("/segments", {
				method: "POST",
				body: { mediaFileId, type, startSeconds: start, endSeconds: effectiveEnd, ...(label.trim() ? { label: label.trim() } : {}) },
			});
			host.toast("success", messages.markerSubmitted);
			setLabel("");
			setTab("list");
			await load(mediaFileId);
		} catch (err) {
			setError(errorText(messages, err, messages.submitFailed));
		} finally {
			setBusy(false);
		}
	};

	const vote = async (segment: PublicSegment, value: 1 | -1): Promise<void> => {
		const next = segment.userVote === value ? 0 : value;
		try {
			await host.api.call("/segments/vote", {
				method: "POST",
				query: { id: segment.id, mediaFileId },
				body: { value: next },
			});
			await load(mediaFileId);
		} catch (err) {
			host.toast("error", errorText(messages, err, messages.voteFailed));
		}
	};

	const remove = async (segment: PublicSegment): Promise<void> => {
		try {
			await host.api.call("/segments", { method: "DELETE", query: { id: segment.id, mediaFileId } });
			host.toast("success", messages.markerRemoved);
			await load(mediaFileId);
		} catch (err) {
			host.toast("error", errorText(messages, err, messages.deleteFailed));
		}
	};

	let content: ReactNode;
	if (tab === "list") {
		if (loading) {
			content = <p className="muted">{messages.loading}</p>;
		} else if (segments.length === 0) {
			content = <div className="empty">{messages.noMarkers}</div>;
		} else {
			content = (
				<div className="list">
					{segments.map((segment) => (
						<div key={segment.id} className="seg">
							<div className="seg-main">
								<div className="row" style={{ gap: "0.35rem" }}>
									<span className="badge">{messages.types[segment.type]}</span>
									<span className={`badge ${segment.status}`}>{messages.statuses[segment.status]}</span>
									{segment.label ? <span>{segment.label}</span> : null}
								</div>
								<span className="muted">
									{segment.type === "highlight" || segment.startSeconds === segment.endSeconds
										? formatTime(segment.startSeconds)
										: `${formatTime(segment.startSeconds)} – ${formatTime(segment.endSeconds)}`}
								</span>
								{segment.status === "hidden" ? <span className="muted">{messages.hiddenHint}</span> : null}
							</div>
							<div className="row" style={{ gap: "0.35rem" }}>
								<button type="button" onClick={() => host.seek(segment.startSeconds)}>
									{messages.play}
								</button>
								<div className="votes">
									<button
										type="button"
										className={segment.userVote === 1 ? "on" : ""}
										disabled={segment.status === "hidden"}
										onClick={() => detach(vote(segment, 1))}
									>
										▲
									</button>
									<span>{segment.score > 0 ? `+${segment.score}` : segment.score}</span>
									<button
										type="button"
										className={segment.userVote === -1 ? "on" : ""}
										disabled={segment.status === "hidden"}
										onClick={() => detach(vote(segment, -1))}
									>
										▼
									</button>
								</div>
								{segment.isMine ? (
									<button type="button" className="danger" onClick={() => detach(remove(segment))}>
										{messages.delete}
									</button>
								) : null}
							</div>
						</div>
					))}
				</div>
			);
		}
	} else {
		content = (
			<form className="panel" onSubmit={(event) => detach(submit(event))}>
				<label htmlFor="type">{messages.segmentType}</label>
				<select
					id="type"
					value={type}
					onChange={(event) => {
						const value = event.target.value;
						if (isSegmentType(value)) setType(value);
					}}
				>
					{TYPES.map((value) => (
						<option key={value} value={value}>
							{messages.types[value]}
						</option>
					))}
				</select>

				{type === "highlight" ? (
					<>
						<label htmlFor="point">{messages.time}</label>
						<div className="row">
							<input id="point" type="number" step="0.1" min="0" value={start} onChange={(event) => setStart(Number(event.target.value))} />
							<button type="button" onClick={() => pickNow("start")}>
								{messages.now}
							</button>
						</div>
					</>
				) : (
					<div className="grid2">
						<div>
							<label htmlFor="start">{messages.startSeconds}</label>
							<div className="row">
								<input
									id="start"
									type="number"
									step="0.1"
									min="0"
									value={start}
									onChange={(event) => setStart(Number(event.target.value))}
								/>
								<button type="button" onClick={() => pickNow("start")}>
									{messages.now}
								</button>
							</div>
						</div>
						<div>
							<label htmlFor="end">{messages.endSeconds}</label>
							<div className="row">
								<input id="end" type="number" step="0.1" min="0" value={end} onChange={(event) => setEnd(Number(event.target.value))} />
								<button type="button" onClick={() => pickNow("end")}>
									{messages.now}
								</button>
							</div>
						</div>
					</div>
				)}

				<label htmlFor="label">{messages.descriptionOptional}</label>
				<input id="label" maxLength={100} value={label} onChange={(event) => setLabel(event.target.value)} />

				<div className="row" style={{ marginTop: "0.75rem", justifyContent: "flex-end" }}>
					<button type="submit" className="primary" disabled={busy}>
						{busy ? messages.submitting : messages.submitMarker}
					</button>
				</div>
			</form>
		);
	}

	return (
		<div className="page">
			<div className="tabs">
				<button type="button" className={tab === "list" ? "active" : ""} onClick={() => setTab("list")}>
					{messages.markersTab(segments.length)}
				</button>
				<button type="button" className={tab === "create" ? "active" : ""} onClick={() => setTab("create")}>
					{messages.reportNew}
				</button>
			</div>

			{error ? <p className="error">{error}</p> : null}

			{content}
		</div>
	);
}
