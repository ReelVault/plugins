import { describe, expect, test } from "bun:test";
import type { MediaRequestsConfig } from "../plugins/media-requests/config";
import {
	RequestConflictError,
	RequestPermissionError,
	type RequestsHost,
	RequestsManager,
} from "../plugins/media-requests/src/requests-manager";
import type { MediaRequestUser } from "../plugins/media-requests/types";

const alice: MediaRequestUser = { userId: "alice" };
const bob: MediaRequestUser = { userId: "bob" };

const noop = () => {
	// Intentionally empty.
};
const silentLogger: RequestsHost["logger"] = {
	trace: noop,
	debug: noop,
	info: noop,
	warn: noop,
	error: noop,
	fatal: noop,
	child: () => silentLogger,
	time: () => noop,
};

/** An in-memory host with the same key rules as the real plugin storage. */
function memoryHost(): RequestsHost {
	const values = new Map<string, unknown>();
	const storage: RequestsHost["storage"] = {
		get: (key) => Promise.resolve(values.get(key)),
		set: (key, value) => {
			values.set(key, structuredClone(value));

			return Promise.resolve();
		},
		update: async (key, updater) => {
			const next = await updater(values.get(key));
			values.set(key, structuredClone(next));

			return next;
		},
		delete: (key) => {
			values.delete(key);

			return Promise.resolve();
		},
		list: () => Promise.resolve([...values.keys()]),
		putBlob: () => Promise.reject(new Error("not used")),
		getBlob: () => Promise.resolve(undefined),
		deleteBlob: () => Promise.resolve(),
	};

	return {
		storage,
		notifications: { create: () => Promise.resolve(), createForAdmins: () => Promise.resolve() },
		logger: silentLogger,
	};
}

function config(overrides: Partial<MediaRequestsConfig> = {}): MediaRequestsConfig {
	return { autoApprove: false, notifyOnAvailable: false, maxActiveRequestsPerUser: 10, showDashboardSection: true, ...overrides };
}

describe("media request manager", () => {
	test("scopes the summary to one user when asked", async () => {
		const manager = new RequestsManager(memoryHost(), config());
		await manager.createRequest({ title: "Alice title", mediaType: "movie" }, alice);
		await manager.createRequest({ title: "Bob title", mediaType: "movie" }, bob);

		expect(await manager.getSummary("alice")).toEqual({
			total: 1,
			pending: 1,
			approved: 0,
			inProgress: 0,
			available: 0,
			rejected: 0,
		});
		expect((await manager.getSummary()).total).toBe(2);
	});

	test("refuses a request above the active-request limit", async () => {
		const manager = new RequestsManager(memoryHost(), config({ maxActiveRequestsPerUser: 1 }));
		await manager.createRequest({ title: "First", mediaType: "movie" }, alice);

		await expect(manager.createRequest({ title: "Second", mediaType: "movie" }, alice)).rejects.toBeInstanceOf(RequestConflictError);
	});

	test("refuses a duplicate title", async () => {
		const manager = new RequestsManager(memoryHost(), config());
		await manager.createRequest({ title: "Only once", mediaType: "movie", year: 2020 }, alice);

		await expect(manager.createRequest({ title: "Only once", mediaType: "movie", year: 2020 }, bob)).rejects.toBeInstanceOf(
			RequestConflictError,
		);
	});

	test("refuses to delete another user's request", async () => {
		const manager = new RequestsManager(memoryHost(), config());
		const request = await manager.createRequest({ title: "Mine", mediaType: "movie" }, alice);

		await expect(manager.deleteRequest(request.id, bob.userId)).rejects.toBeInstanceOf(RequestPermissionError);
	});
});
