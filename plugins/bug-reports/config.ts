import { defineConfig, field, type InferConfig } from "@reelvault/sdk/plugin";

export const config = defineConfig({
	notifyAdminsOnReport: field.boolean({
		label: "Admin notifications",
		description: "Sends the admin a notification for every newly submitted bug report.",
		default: true,
	}),
	maxActiveReportsPerUser: field.number({
		label: "Active reports per user",
		description: "Maximum number of open or in-progress reports a single user may have.",
		default: 20,
		min: 1,
		max: 100,
		step: 1,
	}),
	retentionDays: field.number({
		label: "Closed report retention (days)",
		description: "Days after which closed or rejected reports are deleted automatically (0 = never).",
		default: 90,
		min: 0,
		max: 365,
		step: 1,
	}),
});

export type BugReportsConfig = InferConfig<typeof config>;
