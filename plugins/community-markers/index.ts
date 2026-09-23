import { definePlugin } from "@reelvault/sdk/plugin";
import { config } from "./config";
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
	return value === "pending" || value === "approved" || value === "rejected";
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
		const { approvalThreshold, rejectionThreshold, autoApprove } = host.config;

		host.logger.info("Community Markers plugin initialized", {
			approvalThreshold,
			rejectionThreshold,
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

		// Helper to sync approved segments into ReelVault's native media_markers table
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
					return { body: { error: "The mediaFileId parameter is required." } };
				}

				const storageKey = `media_segments_${mediaFileId}`;
				const stored = await host.storage.get(storageKey);
				const segments = isSegmentSubmissionArray(stored) ? stored : [];

				// Projection without submitter/voter identities (info-leak).
				const result = segments.map((s) => toPublicSegment(s, user));

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
					return { body: { error: "Invalid segment submission data." } };
				}

				// Only submit for files that actually exist in the library.
				const mediaFile = await host.media.get(data.mediaFileId);
				if (!mediaFile) {
					return { status: 404, body: { error: "The given mediaFileId does not exist in the library." } };
				}

				if (data.type === "highlight") {
					data.endSeconds = data.startSeconds;
				}

				if (data.startSeconds < 0 || (data.type !== "highlight" && data.endSeconds <= data.startSeconds)) {
					return { body: { error: "End time must be greater than the start time." } };
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
					return { status: 507, body: { error: "Could not save the submission (plugin storage limit?). Try again later." } };
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
					return { body: { error: "Required parameters: id, mediaFileId and value (-1, 0, 1)." } };
				}

				const updatedSegment = await withMediaFileLock(mediaFileId, async () => {
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

					// Check for rejection (2 downvotes, or score below the threshold)
					const isRejected = segment.downvotes.length >= 2 || segment.score <= rejectionThreshold;

					if (isRejected) {
						if (segment.status !== "rejected") {
							segment.status = "rejected";
							await syncApprovedMarkers(mediaFileId);
							host.realtime.broadcast("segment:rejected", toPublicSegment(segment, user));
						}
					} else if (
						segment.status === "rejected" ||
						(segment.status === "pending" && (autoApprove || segment.score >= approvalThreshold))
					) {
						// If not rejected and autoApprove is on, or score >= approvalThreshold
						segment.status = "approved";
						await syncApprovedMarkers(mediaFileId);
						host.realtime.broadcast("segment:approved", toPublicSegment(segment, user));
					}

					await host.storage.set(storageKey, segments);
					return segment;
				});

				if (!updatedSegment) {
					return { body: { error: "Submitted segment not found." } };
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
					return { body: { error: "Wymagane parametry id i mediaFileId." } };
				}

				const wasApproved = await withMediaFileLock(mediaFileId, async () => {
					const storageKey = `media_segments_${mediaFileId}`;
					const stored = await host.storage.get(storageKey);
					const segments = isSegmentSubmissionArray(stored) ? stored : [];
					const index = segments.findIndex((s) => s.id === segmentId);

					if (index === -1) return null;

					const segment = segments[index];
					if (!segment) return null;

					if (segment.submittedByUserId !== user.id && user.role !== "admin") {
						return "forbidden" as const;
					}

					const approved = segment.status === "approved";
					segments.splice(index, 1);
					await host.storage.set(storageKey, segments);
					return approved;
				});

				if (wasApproved === null) {
					return { body: { error: "Nie znaleziono segmentu." } };
				}
				if (wasApproved === "forbidden") {
					return { body: { error: "You do not have permission to delete this report." } };
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
					return { body: { error: "The id and mediaFileId parameters are required." } };
				}

				const storageKey = `media_segments_${mediaFileId}`;
				const stored = await host.storage.get(storageKey);
				const segments = isSegmentSubmissionArray(stored) ? stored : [];
				const segment = segments.find((s) => s.id === segmentId);

				if (!segment) {
					return { body: { error: "Nie znaleziono segmentu." } };
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

				segment.updatedAt = new Date().toISOString();
				await host.storage.set(storageKey, segments);
				await syncApprovedMarkers(mediaFileId);

				host.realtime.broadcast("segment:updated", segment);

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
					return { body: { error: "The id and mediaFileId parameters are required." } };
				}

				const storageKey = `media_segments_${mediaFileId}`;
				const stored = await host.storage.get(storageKey);
				const segments = isSegmentSubmissionArray(stored) ? stored : [];
				const index = segments.findIndex((s) => s.id === segmentId);

				if (index === -1) {
					return { body: { error: "Nie znaleziono segmentu." } };
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
