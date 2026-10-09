import type { SegmentStatus, SegmentSubmission } from "../types";

/** The configured rules that decide how votes move a segment. */
export interface VoteRules {
	approvalThreshold: number;
	autoApprove: boolean;
	downvotesToHide: number;
	rejectionThreshold: number;
}

/** The viewer a visibility or delete decision is made for. */
export interface Viewer {
	id: string;
	role: string;
}

/** The segment fields the vote rules read. */
export type VotedSegment = Pick<SegmentSubmission, "downvotes" | "lockedByAdmin" | "score" | "status">;

/**
 * The status a segment has after a vote. Hidden segments and administrator decisions are only
 * moved by an administrator, so votes leave them alone.
 */
export function statusAfterVote(segment: VotedSegment, rules: VoteRules): SegmentStatus {
	if (segment.lockedByAdmin || segment.status === "hidden") return segment.status;
	if (segment.downvotes.length >= rules.downvotesToHide) return "hidden";
	if (segment.score <= rules.rejectionThreshold) return "rejected";

	// A rejected segment is approved again once its score recovers; a pending one is approved at the threshold.
	const recovered = segment.status === "rejected";
	const reachedThreshold = segment.status === "pending" && (rules.autoApprove || segment.score >= rules.approvalThreshold);
	return recovered || reachedThreshold ? "approved" : segment.status;
}

/** Hidden segments are left out of the list for everyone except their author and administrators. */
export function isVisibleTo(segment: Pick<SegmentSubmission, "status" | "submittedByUserId">, viewer: Viewer): boolean {
	return segment.status !== "hidden" || segment.submittedByUserId === viewer.id || viewer.role === "admin";
}

/**
 * Why an author-side delete is refused, or `undefined` when it may proceed. Administrators may always
 * delete; anyone else may delete only their own segment, and only before an administrator decided on it.
 */
export function deleteRefusal(
	segment: Pick<SegmentSubmission, "lockedByAdmin" | "submittedByUserId">,
	viewer: Viewer,
): "forbidden" | "locked" | undefined {
	if (viewer.role === "admin") return undefined;
	if (segment.submittedByUserId !== viewer.id) return "forbidden";
	if (segment.lockedByAdmin) return "locked";
	return undefined;
}
