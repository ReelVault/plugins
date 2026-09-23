export type SegmentType = "intro" | "credits" | "recap" | "chapter" | "highlight";
export type SegmentStatus = "pending" | "approved" | "rejected";

/** Projection returned by the user-facing `/segments` routes. */
export interface PublicSegment {
	id: string;
	mediaFileId: string;
	type: SegmentType;
	startSeconds: number;
	endSeconds: number;
	label?: string;
	createdAt: string;
	updatedAt: string;
	score: number;
	status: SegmentStatus;
	isMine: boolean;
	userVote: 1 | -1 | 0;
}

/** Full record returned by the admin routes. */
export interface AdminSegment {
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
	status: SegmentStatus;
}
