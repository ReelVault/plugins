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
		label: "Rejection threshold (downvotes)",
		description: "Negative score (e.g. -2) at which a segment is rejected automatically and removed from the player.",
		default: -2,
		max: -1,
		step: 1,
	}),
});

export type CommunityMarkersConfig = InferConfig<typeof config>;
