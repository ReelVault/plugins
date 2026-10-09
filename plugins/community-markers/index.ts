import { definePlugin } from "@reelvault/sdk/plugin";
import { config } from "./config";
import { deleteRefusal, isVisibleTo, statusAfterVote, type VoteRules } from "./src/moderation";
import type { CreateSegmentRequest, SegmentSubmission, SegmentType, UpdateSegmentRequest, VoteSegmentRequest } from "./types";

const REGISTERED_FILES_KEY = "registered_media_files";
const SEGMENT_TYPES: ReadonlySet<string> = new Set(["intro", "credits", "recap", "chapter", "highlight"]);

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isSegmentType(value: unknown): value is SegmentType {
	return typeof value === "string" && SEGMENT_TYPES.has(value);
}

function isSegmentStatus(value: unknown): value is SegmentSubmission["status"] {
	return value === "pending" || value === "approved" || value === "rejected" || value === "hidden";
}

function isStringArray(value: unknown): value is string[] {
	return Array.isArray(value) && value.every((item: unknown) => typeof item === "string");
}

function isSegmentSubmissionArray(value: unknown): value is SegmentSubmission[] {
	return Array.isArray(value);
}

function parseCreateSegmentRequest(body: unknown): CreateSegmentRequest | null {
	if (!isRecord(body)) return null;
	const { mediaFileId, type, startSeconds, endSeconds, label } = body;
	if (typeof mediaFileId !== "string" || !isSegmentType(type)) return null;
	if (typeof startSeconds !== "number" || typeof endSeconds !== "number") return null;

	return {
		mediaFileId,
		type,
		startSeconds,
		endSeconds,
		...(typeof label === "string" ? { label } : {}),
	};
}

function parseVoteSegmentRequest(body: unknown): VoteSegmentRequest | null {
	if (!isRecord(body)) return null;
	const value = body.value;
	if (value !== 1 && value !== -1 && value !== 0) return null;
	return { value };
}

function parseUpdateSegmentRequest(body: unknown): UpdateSegmentRequest | null {
	if (!isRecord(body)) return null;

	const update: UpdateSegmentRequest = {};
	if (isSegmentType(body.type)) update.type = body.type;
	if (typeof body.startSeconds === "number") update.startSeconds = body.startSeconds;
	if (typeof body.endSeconds === "number") update.endSeconds = body.endSeconds;
	if (typeof body.label === "string") update.label = body.label;
	if (isSegmentStatus(body.status)) update.status = body.status;
	return update;
}

function userVoteValue(segment: SegmentSubmission, userId: string): 1 | -1 | 0 {
	if (segment.upvotes.includes(userId)) return 1;
	if (segment.downvotes.includes(userId)) return -1;
	return 0;
}

function toPublicSegment(segment: SegmentSubmission, user: { id: string }) {
	// Projection: no submitter identities and no voter lists — only what the
	// UI renders (score, own vote, own-submission flag).
	return {
		id: segment.id,
		mediaFileId: segment.mediaFileId,
		type: segment.type,
		startSeconds: segment.startSeconds,
		endSeconds: segment.endSeconds,
		label: segment.label,
		createdAt: segment.createdAt,
		updatedAt: segment.updatedAt,
		score: segment.score,
		status: segment.status,
		isMine: segment.submittedByUserId === user.id,
		userVote: userVoteValue(segment, user.id),
	};
}

export default definePlugin(config, {
	async setup(host) {
		const { approvalThreshold, rejectionThreshold, autoApprove, downvotesToHide } = host.config;
		const rules: VoteRules = { approvalThreshold, rejectionThreshold, autoApprove, downvotesToHide };

		host.logger.info("Community Markers plugin initialized", {
			approvalThreshold,
			rejectionThreshold,
			downvotesToHide,
			autoApprove,
		});

		async function registerMediaFile(mediaFileId: string): Promise<void> {
			try {
				const stored = await host.storage.get(REGISTERED_FILES_KEY);
				const list = isStringArray(stored) ? stored : [];
				if (!list.includes(mediaFileId)) {
					list.push(mediaFileId);
					await host.storage.set(REGISTERED_FILES_KEY, list);
				}
			} catch (err) {
				host.logger.warn("Failed to register mediaFileId index", { mediaFileId, err });
			}
		}

		// Serializes read-modify-write cycles per media file — two concurrent votes
		// would otherwise lose updates (the whole list is one storage value).
		const mediaFileLocks = new Map<string, Promise<unknown>>();

		async function withMediaFileLock<T>(mediaFileId: string, operation: () => Promise<T>): Promise<T> {
			const previous = mediaFileLocks.get(mediaFileId) ?? Promise.resolve();
			const run = (async (): Promise<T> => {
				try {
					await previous;
				} catch {
					// A failed predecessor must not block queued operations.
				}
				return operation();
			})();
			mediaFileLocks.set(mediaFileId, run);
			try {
				return await run;
			} finally {
				if (mediaFileLocks.get(mediaFileId) === run) {
					mediaFileLocks.delete(mediaFileId);
				}
			}
		}

		// Helper to sync approved segments into ReelVault's native media_markers table.
		// It reads the segments back from storage, so callers must store their changes first.
		async function syncApprovedMarkers(mediaFileId: string): Promise<void> {
			try {
				const storageKey = `media_segments_${mediaFileId}`;
				const stored = await host.storage.get(storageKey);
				const segments = isSegmentSubmissionArray(stored) ? stored : [];
				const approved = segments.filter((s) => s.status === "approved");

				const markersToSet = approved.map((s) => ({
					type: s.type,
					startSeconds: s.startSeconds,
					endSeconds: s.endSeconds,
					label: s.label ?? s.type.toUpperCase(),
					source: "plugin" as const,
					pluginId: "org.reelvault.community-markers",
				}));

				await host.markers.set(mediaFileId, markersToSet);
				host.logger.debug("Synchronized approved community markers to core", {
					mediaFileId,
					count: markersToSet.length,
				});
			} catch (err) {
				host.logger.error("Failed to sync approved markers to core", err, { mediaFileId });
			}
		}

		// GET /segments?mediaFileId=...
		await host.routes.register({
			method: "GET",
			path: "/segments",
			handler: async ({ query, user }) => {
				const mediaFileId = query.mediaFileId;
				if (!mediaFileId) {
					return { status: 400, body: { code: "segment.media_required" } };
				}

				const storageKey = `media_segments_${mediaFileId}`;
				const stored = await host.storage.get(storageKey);
				const segments = isSegmentSubmissionArray(stored) ? stored : [];

				// Projection without submitter/voter identities (info-leak). Hidden segments stay out of the list.
				const result = segments.filter((s) => isVisibleTo(s, user)).map((s) => toPublicSegment(s, user));

				return { body: result };
			},
		});

		// POST /segments - submit a new segment
		await host.routes.register({
			method: "POST",
			path: "/segments",
			handler: async ({ body, user }) => {
				const data = parseCreateSegmentRequest(body);
				if (!data) {
					return { status: 400, body: { code: "segment.invalid" } };
				}

				// Only submit for files that actually exist in the library.
				const mediaFile = await host.media.get(data.mediaFileId);
				if (!mediaFile) {
					return { status: 404, body: { code: "segment.media_not_found" } };
				}

				if (data.type === "highlight") {
					data.endSeconds = data.startSeconds;
				}

				if (data.startSeconds < 0 || (data.type !== "highlight" && data.endSeconds <= data.startSeconds)) {
					return { status: 400, body: { code: "segment.range_invalid" } };
				}

				try {
					const submission = await withMediaFileLock(data.mediaFileId, async () => {
						const storageKey = `media_segments_${data.mediaFileId}`;
						const stored = await host.storage.get(storageKey);
						const segments = isSegmentSubmissionArray(stored) ? stored : [];

						const newId = crypto.randomUUID();
						const now = new Date().toISOString();

						// By default segments are approved and live for everyone immediately
						const isInstantlyApproved = autoApprove || approvalThreshold <= 1;

						const trimmedLabel = data.label?.trim();

						const newSubmission: SegmentSubmission = {
							id: newId,
							mediaFileId: data.mediaFileId,
							type: data.type,
							startSeconds: Math.round(data.startSeconds * 100) / 100,
							endSeconds: Math.round(data.endSeconds * 100) / 100,
							label: trimmedLabel === "" ? undefined : trimmedLabel,
							submittedByUserId: user.id,
							submittedByProfileId: user.profileId,
							createdAt: now,
							updatedAt: now,
							upvotes: [user.id],
							downvotes: [],
							score: 1,
							status: isInstantlyApproved ? "approved" : "pending",
						};

						segments.push(newSubmission);
						await host.storage.set(storageKey, segments);
						await registerMediaFile(data.mediaFileId);
						return newSubmission;
					});

					if (submission.status === "approved") {
						await syncApprovedMarkers(data.mediaFileId);
						host.realtime.broadcast("segment:approved", toPublicSegment(submission, user));
					} else {
						host.realtime.broadcast("segment:submitted", toPublicSegment(submission, user));
					}

					host.logger.info("New community segment submitted", {
						id: submission.id,
						mediaFileId: data.mediaFileId,
						type: data.type,
						userId: user.id,
						status: submission.status,
					});

					return {
						status: 201,
						body: toPublicSegment(submission, user),
					};
				} catch (err) {
					// Storage overflow (64 KiB per key) and similar failures must not 500 raw.
					host.logger.error("Failed to store community segment", err, { mediaFileId: data.mediaFileId });
					return { status: 507, body: { code: "segment.storage_full" } };
				}
			},
		});

		// POST /segments/vote - vote on a segment (+1, -1, 0)
		await host.routes.register({
			method: "POST",
			path: "/segments/vote",
			handler: async ({ query, body, user }) => {
				const segmentId = query.id;
				const mediaFileId = query.mediaFileId;
				const voteData = parseVoteSegmentRequest(body);

				if (!(segmentId && mediaFileId && voteData)) {
					return { status: 400, body: { code: "segment.vote_params_required" } };
				}

				const voted = await withMediaFileLock(mediaFileId, async () => {
					const storageKey = `media_segments_${mediaFileId}`;
					const stored = await host.storage.get(storageKey);
					const segments = isSegmentSubmissionArray(stored) ? stored : [];
					const segment = segments.find((s) => s.id === segmentId);

					if (!segment) return null;

					// Update the vote list
					segment.upvotes = segment.upvotes.filter((uid) => uid !== user.id);
					segment.downvotes = segment.downvotes.filter((uid) => uid !== user.id);

					if (voteData.value === 1) {
						segment.upvotes.push(user.id);
					} else if (voteData.value === -1) {
						segment.downvotes.push(user.id);
					}

					segment.score = segment.upvotes.length - segment.downvotes.length;
					segment.updatedAt = new Date().toISOString();

					const previousStatus = segment.status;
					segment.status = statusAfterVote(segment, rules);

					// Store first: the marker sync reads the segments back from storage.
					await host.storage.set(storageKey, segments);
					if (segment.status !== previousStatus) {
						await syncApprovedMarkers(mediaFileId);
					}

					return { segment, previousStatus };
				});

				if (!voted) {
					return { status: 404, body: { code: "segment.not_found" } };
				}

				const { segment: updatedSegment, previousStatus } = voted;
				if (updatedSegment.status !== previousStatus) {
					if (updatedSegment.status === "hidden") {
						// Hidden segments are announced without their content: only identifiers and status.
						host.realtime.broadcast("segment:hidden", {
							id: updatedSegment.id,
							mediaFileId,
							score: updatedSegment.score,
							status: updatedSegment.status,
						});
					} else if (updatedSegment.status === "rejected") {
						host.realtime.broadcast("segment:rejected", toPublicSegment(updatedSegment, user));
					} else if (updatedSegment.status === "approved") {
						host.realtime.broadcast("segment:approved", toPublicSegment(updatedSegment, user));
					}
				}

				host.realtime.broadcast("segment:voted", {
					id: updatedSegment.id,
					mediaFileId,
					score: updatedSegment.score,
					status: updatedSegment.status,
				});

				return {
					body: toPublicSegment(updatedSegment, user),
				};
			},
		});

		// DELETE /segments - delete a submission (author)
		await host.routes.register({
			method: "DELETE",
			path: "/segments",
			handler: async ({ query, user }) => {
				const segmentId = query.id;
				const mediaFileId = query.mediaFileId;

				if (!(segmentId && mediaFileId)) {
					return { status: 400, body: { code: "segment.params_required" } };
				}

				const wasApproved = await withMediaFileLock(mediaFileId, async () => {
					const storageKey = `media_segments_${mediaFileId}`;
					const stored = await host.storage.get(storageKey);
					const segments = isSegmentSubmissionArray(stored) ? stored : [];
					const index = segments.findIndex((s) => s.id === segmentId);

					if (index === -1) return null;

					const segment = segments[index];
					if (!segment) return null;

					const refusal = deleteRefusal(segment, user);
					if (refusal) return refusal;

					const approved = segment.status === "approved";
					segments.splice(index, 1);
					await host.storage.set(storageKey, segments);
					return approved;
				});

				if (wasApproved === null) {
					return { status: 404, body: { code: "segment.not_found" } };
				}
				if (wasApproved === "forbidden") {
					return { status: 403, body: { code: "segment.forbidden" } };
				}
				if (wasApproved === "locked") {
					return { status: 409, body: { code: "segment.locked" } };
				}

				if (wasApproved) {
					await syncApprovedMarkers(mediaFileId);
				}

				host.realtime.broadcast("segment:deleted", { id: segmentId, mediaFileId });

				return { body: { success: true } };
			},
		});

		// ----------------------------------------------------
		// ADMIN ROUTES (access: "admin")
		// ----------------------------------------------------

		// GET /admin/segments - all segments across every file
		await host.routes.register({
			method: "GET",
			path: "/admin/segments",
			access: "admin",
			handler: async () => {
				const storedFiles = await host.storage.get(REGISTERED_FILES_KEY);
				const registeredFiles = isStringArray(storedFiles) ? storedFiles : [];
				const allSegments: SegmentSubmission[] = [];

				for (const mediaFileId of registeredFiles) {
					const storageKey = `media_segments_${mediaFileId}`;
					const stored = await host.storage.get(storageKey);
					const fileSegments = isSegmentSubmissionArray(stored) ? stored : [];
					allSegments.push(...fileSegments);
				}

				// Sortowanie od najnowszych
				allSegments.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

				return {
					body: {
						segments: allSegments,
						total: allSegments.length,
					},
				};
			},
		});

		// PATCH /admin/segments - edit/approve a segment (admin)
		await host.routes.register({
			method: "PATCH",
			path: "/admin/segments",
			access: "admin",
			handler: async ({ query, body }) => {
				const segmentId = query.id;
				const mediaFileId = query.mediaFileId;
				const updateData = parseUpdateSegmentRequest(body);

				if (!(segmentId && mediaFileId && updateData)) {
					return { status: 400, body: { code: "segment.params_required" } };
				}

				const storageKey = `media_segments_${mediaFileId}`;
				const stored = await host.storage.get(storageKey);
				const segments = isSegmentSubmissionArray(stored) ? stored : [];
				const segment = segments.find((s) => s.id === segmentId);

				if (!segment) {
					return { status: 404, body: { code: "segment.not_found" } };
				}

				if (updateData.type) {
					segment.type = updateData.type;
				}

				if (typeof updateData.startSeconds === "number" && updateData.startSeconds >= 0) {
					segment.startSeconds = Math.round(updateData.startSeconds * 100) / 100;
				}

				if (segment.type === "highlight") {
					segment.endSeconds = segment.startSeconds;
				} else if (typeof updateData.endSeconds === "number" && updateData.endSeconds > segment.startSeconds) {
					segment.endSeconds = Math.round(updateData.endSeconds * 100) / 100;
				}

				if (updateData.label !== undefined) {
					segment.label = updateData.label.trim() || undefined;
				}

				if (updateData.status) {
					segment.status = updateData.status;
				}

				// Any administrator edit is a decision: community votes no longer change this segment.
				segment.lockedByAdmin = true;
				segment.updatedAt = new Date().toISOString();
				await host.storage.set(storageKey, segments);
				await syncApprovedMarkers(mediaFileId);

				// Realtime carries identifiers and status only; the full record stays in the admin response.
				host.realtime.broadcast("segment:updated", {
					id: segment.id,
					mediaFileId,
					score: segment.score,
					status: segment.status,
				});

				return { body: segment };
			},
		});

		// DELETE /admin/segments - delete a segment (admin)
		await host.routes.register({
			method: "DELETE",
			path: "/admin/segments",
			access: "admin",
			handler: async ({ query }) => {
				const segmentId = query.id;
				const mediaFileId = query.mediaFileId;

				if (!(segmentId && mediaFileId)) {
					return { status: 400, body: { code: "segment.params_required" } };
				}

				const storageKey = `media_segments_${mediaFileId}`;
				const stored = await host.storage.get(storageKey);
				const segments = isSegmentSubmissionArray(stored) ? stored : [];
				const index = segments.findIndex((s) => s.id === segmentId);

				if (index === -1) {
					return { status: 404, body: { code: "segment.not_found" } };
				}

				const segment = segments[index];
				const wasApproved = segment?.status === "approved";
				segments.splice(index, 1);
				await host.storage.set(storageKey, segments);

				if (wasApproved) {
					await syncApprovedMarkers(mediaFileId);
				}

				host.realtime.broadcast("segment:deleted", { id: segmentId, mediaFileId });

				return { body: { success: true } };
			},
		});
	},
});
