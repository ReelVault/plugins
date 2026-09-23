// Fire-and-forget runner for background tasks (the plugin UI cannot import
// host internals). Mirrors the Website detach helper: failures are logged
// instead of surfacing as unhandled rejections, and the bounded store keeps
// bookkeeping entries so the queue cannot grow without limit.
interface DetachedTask {
	promise: Promise<void>;
}

const recentTasks: DetachedTask[] = [];
const maxTrackedTasks = 16;

async function settle(task: Promise<unknown>): Promise<void> {
	try {
		await task;
	} catch (error: unknown) {
		console.error("Background plugin task failed", error);
	}
}

export function detach(task: Promise<unknown>): void {
	recentTasks.push({ promise: settle(task) });
	if (recentTasks.length > maxTrackedTasks) {
		recentTasks.splice(0, recentTasks.length - maxTrackedTasks);
	}
}
