import { defineConfig, field, type InferConfig } from "@reelvault/sdk/plugin";

export const config = defineConfig({
	autoApprove: field.boolean({
		label: "Automatic approval (auto-approve)",
		description:
			"Whether newly submitted segments go live in the player for everyone immediately (SponsorBlock style). Off by default — a new segment must reach the vote threshold first.",
		default: false,
	}),
	approvalThreshold: field.number({
		label: "Approval threshold (upvotes)",
		description: "Score needed to approve a segment in manual mode.",
		default: 1,
		min: 1,
		step: 1,
	}),
	rejectionThreshold: field.number({
		label: "Rejection threshold (score)",
		description: "Negative score (e.g. -2) at which a segment is rejected automatically and removed from the player.",
		default: -2,
		max: -1,
		step: 1,
	}),
	downvotesToHide: field.number({
		label: "Downvotes that hide a segment",
		description:
			"Number of downvotes at which a segment is hidden from the player until an administrator confirms or rejects it. Administrator decisions are never changed by votes.",
		default: 2,
		min: 1,
		max: 100,
		step: 1,
	}),
});

export type CommunityMarkersConfig = InferConfig<typeof config>;
