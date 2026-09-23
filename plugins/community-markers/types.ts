export type SegmentType = "intro" | "credits" | "recap" | "chapter" | "highlight";

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
	status: "pending" | "approved" | "rejected";
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
	status?: "pending" | "approved" | "rejected";
}
