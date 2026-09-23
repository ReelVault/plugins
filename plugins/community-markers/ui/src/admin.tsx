import { type ReactNode, useCallback, useEffect, useState } from "react";
import { detach } from "./detach";
import { usePluginHost } from "./host-context";
import type { AdminSegment, SegmentStatus, SegmentType } from "./types";

const TYPES: SegmentType[] = ["intro", "credits", "recap", "chapter", "highlight"];
const STATUSES: SegmentStatus[] = ["pending", "approved", "rejected"];

const SEGMENT_TYPES: ReadonlySet<string> = new Set(TYPES);
const SEGMENT_STATUSES: ReadonlySet<string> = new Set(STATUSES);

function isSegmentType(value: string): value is SegmentType {
	return SEGMENT_TYPES.has(value);
}

function isSegmentStatus(value: string): value is SegmentStatus {
	return SEGMENT_STATUSES.has(value);
}

function formatTime(seconds: number): string {
	const total = Math.max(0, Math.floor(seconds));
	const m = Math.floor(total / 60);
	const s = total % 60;
	return `${m}:${String(s).padStart(2, "0")}`;
}

export function CommunityMarkersAdmin() {
	const host = usePluginHost();
	const [segments, setSegments] = useState<AdminSegment[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState("");
	const [statusFilter, setStatusFilter] = useState<SegmentStatus | "all">("all");
	const [editing, setEditing] = useState<AdminSegment | null>(null);

	const load = useCallback(async (): Promise<void> => {
		try {
			const result = await host.api.call<{ segments: AdminSegment[]; total: number }>("/admin/segments");
			setSegments(result.segments);
			setError("");
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to load segments");
		} finally {
			setLoading(false);
		}
	}, [host]);

	useEffect(() => {
		detach(load());
	}, [load]);

	const remove = async (segment: AdminSegment): Promise<void> => {
		try {
			await host.api.call("/admin/segments", { method: "DELETE", query: { id: segment.id, mediaFileId: segment.mediaFileId } });
			host.toast("success", "Segment deleted");
			await load();
		} catch (err) {
			host.toast("error", err instanceof Error ? err.message : "Delete failed");
		}
	};

	const filtered = statusFilter === "all" ? segments : segments.filter((segment) => segment.status === statusFilter);

	let body: ReactNode;
	if (loading) {
		body = <p className="muted">Loading…</p>;
	} else if (filtered.length === 0) {
		body = <div className="empty">No segments.</div>;
	} else {
		body = (
			<div className="list">
				{filtered.map((segment) => (
					<div key={segment.id} className="seg">
						<div className="seg-main">
							<div className="row" style={{ gap: "0.35rem" }}>
								<span className="badge">{segment.type}</span>
								<span className={`badge ${segment.status}`}>{segment.status}</span>
								<span className="muted">score {segment.score}</span>
								{segment.label ? <span>{segment.label}</span> : null}
							</div>
							<span className="muted">
								{formatTime(segment.startSeconds)} – {formatTime(segment.endSeconds)} · {segment.mediaFileId}
							</span>
						</div>
						<div className="row" style={{ gap: "0.35rem" }}>
							<button type="button" onClick={() => setEditing(segment)}>
								Edit
							</button>
							<button type="button" className="danger" onClick={() => detach(remove(segment))}>
								Delete
							</button>
						</div>
					</div>
				))}
			</div>
		);
	}

	return (
		<div className="page">
			{error ? <p className="error">{error}</p> : null}

			<div className="row">
				<label htmlFor="filter" style={{ margin: 0 }}>
					Status
				</label>
				<select
					id="filter"
					value={statusFilter}
					onChange={(event) => {
						const value = event.target.value;
						if (value === "all" || isSegmentStatus(value)) setStatusFilter(value);
					}}
					style={{ width: "auto" }}
				>
					<option value="all">all</option>
					{STATUSES.map((value) => (
						<option key={value} value={value}>
							{value}
						</option>
					))}
				</select>
				<span className="muted">{filtered.length} segments</span>
			</div>

			{editing ? (
				<Editor
					segment={editing}
					onClose={() => setEditing(null)}
					onSaved={async () => {
						setEditing(null);
						await load();
					}}
				/>
			) : null}

			{body}
		</div>
	);
}

function Editor({ segment, onClose, onSaved }: { segment: AdminSegment; onClose: () => void; onSaved: () => Promise<void> }) {
	const host = usePluginHost();
	const [type, setType] = useState<SegmentType>(segment.type);
	const [start, setStart] = useState(segment.startSeconds);
	const [end, setEnd] = useState(segment.endSeconds);
	const [label, setLabel] = useState(segment.label ?? "");
	const [status, setStatus] = useState<SegmentStatus>(segment.status);
	const [saving, setSaving] = useState(false);

	const save = async (): Promise<void> => {
		setSaving(true);
		try {
			await host.api.call("/admin/segments", {
				method: "PATCH",
				query: { id: segment.id, mediaFileId: segment.mediaFileId },
				body: { type, startSeconds: start, endSeconds: end, label, status },
			});
			host.toast("success", "Segment updated");
			await onSaved();
		} catch (err) {
			host.toast("error", err instanceof Error ? err.message : "Update failed");
		} finally {
			setSaving(false);
		}
	};

	return (
		<div className="panel">
			<h2>Edit segment</h2>
			<div className="grid2">
				<div>
					<label htmlFor="e-type">Type</label>
					<select
						id="e-type"
						value={type}
						onChange={(event) => {
							const value = event.target.value;
							if (isSegmentType(value)) setType(value);
						}}
					>
						{TYPES.map((value) => (
							<option key={value} value={value}>
								{value}
							</option>
						))}
					</select>
				</div>
				<div>
					<label htmlFor="e-status">Status</label>
					<select
						id="e-status"
						value={status}
						onChange={(event) => {
							const value = event.target.value;
							if (isSegmentStatus(value)) setStatus(value);
						}}
					>
						{STATUSES.map((value) => (
							<option key={value} value={value}>
								{value}
							</option>
						))}
					</select>
				</div>
				<div>
					<label htmlFor="e-start">Start (seconds)</label>
					<input id="e-start" type="number" step="0.1" min="0" value={start} onChange={(event) => setStart(Number(event.target.value))} />
				</div>
				<div>
					<label htmlFor="e-end">End (seconds)</label>
					<input
						id="e-end"
						type="number"
						step="0.1"
						min="0"
						value={end}
						disabled={type === "highlight"}
						onChange={(event) => setEnd(Number(event.target.value))}
					/>
				</div>
			</div>
			<label htmlFor="e-label">Label</label>
			<input id="e-label" value={label} onChange={(event) => setLabel(event.target.value)} />
			<div className="row" style={{ marginTop: "0.75rem", justifyContent: "flex-end" }}>
				<button type="button" onClick={onClose}>
					Cancel
				</button>
				<button type="button" className="primary" disabled={saving} onClick={() => detach(save())}>
					{saving ? "Saving…" : "Save"}
				</button>
			</div>
		</div>
	);
}
