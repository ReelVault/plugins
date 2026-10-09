export type SegmentType = "intro" | "credits" | "recap" | "chapter" | "highlight";
export type SegmentStatus = "pending" | "approved" | "rejected" | "hidden";

export interface SegmentSubmission {
	id: string;
	mediaFileId: string;
	type: SegmentType;
	startSeconds: number;
	endSeconds: number;
	label?: string;
	submittedByUserId: string;
	submittedByProfileId?: string;
	createdAt: string;
	updatedAt: string;
	upvotes: string[];
	downvotes: string[];
	score: number;
	/** `hidden` is set by negative votes; only an administrator moves a hidden segment on. */
	status: SegmentStatus;
	/** Set by any administrator edit; votes then no longer change the status. */
	lockedByAdmin?: boolean;
}

export interface CreateSegmentRequest {
	mediaFileId: string;
	type: SegmentType;
	startSeconds: number;
	endSeconds: number;
	label?: string;
}

export interface VoteSegmentRequest {
	value: 1 | -1 | 0;
}

export interface UpdateSegmentRequest {
	type?: SegmentType;
	startSeconds?: number;
	endSeconds?: number;
	label?: string;
	status?: SegmentStatus;
}
