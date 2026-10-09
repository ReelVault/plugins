import { describe, expect, test } from "bun:test";
import plugin from "../plugins/community-markers/index";
import {
	deleteRefusal,
	isVisibleTo,
	statusAfterVote,
	type Viewer,
	type VotedSegment,
	type VoteRules,
} from "../plugins/community-markers/src/moderation";
import { errorText, getMessages } from "../plugins/community-markers/ui/src/messages";

const RULES: VoteRules = { approvalThreshold: 1, autoApprove: false, downvotesToHide: 2, rejectionThreshold: -2 };

const FILE = "file-1";
const AUTHOR: Viewer = { id: "author", role: "user" };
const VIEWER: Viewer = { id: "viewer", role: "user" };
const OTHER: Viewer = { id: "other", role: "user" };
const THIRD: Viewer = { id: "third", role: "user" };
const ADMIN: Viewer = { id: "admin", role: "admin" };

function votedSegment(overrides: Partial<VotedSegment> = {}): VotedSegment {
	return { downvotes: [], lockedByAdmin: false, score: 1, status: "approved", ...overrides };
}

describe("statusAfterVote", () => {
	test("hides a segment once it reaches the downvote limit, before the score would reject it", () => {
		expect(statusAfterVote(votedSegment({ downvotes: ["a", "b"], score: -1 }), RULES)).toBe("hidden");
	});

	test("rejects a segment whose score reaches the rejection threshold while it has fewer downvotes", () => {
		const rules = { ...RULES, downvotesToHide: 5 };
		expect(statusAfterVote(votedSegment({ downvotes: ["a", "b"], score: -2 }), rules)).toBe("rejected");
	});

	test("administrator decisions and hidden segments are not moved by votes", () => {
		expect(statusAfterVote(votedSegment({ downvotes: ["a", "b", "c"], lockedByAdmin: true, score: -3 }), RULES)).toBe("approved");
		expect(statusAfterVote(votedSegment({ status: "hidden", score: 4 }), RULES)).toBe("hidden");
	});

	test("a rejected segment is approved again once its score recovers", () => {
		expect(statusAfterVote(votedSegment({ status: "rejected", score: 0 }), RULES)).toBe("approved");
	});

	test("a pending segment is approved at the approval threshold or when auto-approval is on", () => {
		expect(statusAfterVote(votedSegment({ status: "pending", score: 0 }), RULES)).toBe("pending");
		expect(statusAfterVote(votedSegment({ status: "pending", score: 1 }), RULES)).toBe("approved");
		expect(statusAfterVote(votedSegment({ status: "pending", score: 0 }), { ...RULES, autoApprove: true })).toBe("approved");
	});
});

describe("isVisibleTo and deleteRefusal", () => {
	const hidden = { status: "hidden" as const, submittedByUserId: AUTHOR.id };

	test("hidden segments are shown only to their author and administrators", () => {
		expect(isVisibleTo(hidden, AUTHOR)).toBe(true);
		expect(isVisibleTo(hidden, VIEWER)).toBe(false);
		expect(isVisibleTo(hidden, ADMIN)).toBe(true);
	});

	test("segments in other states are visible to everyone", () => {
		expect(isVisibleTo({ status: "rejected" as const, submittedByUserId: AUTHOR.id }, VIEWER)).toBe(true);
	});

	test("an author cannot delete a segment an administrator decided on, but an administrator can", () => {
		expect(deleteRefusal({ lockedByAdmin: true, submittedByUserId: AUTHOR.id }, AUTHOR)).toBe("locked");
		expect(deleteRefusal({ lockedByAdmin: true, submittedByUserId: AUTHOR.id }, ADMIN)).toBeUndefined();
	});

	test("only the author or an administrator can delete a segment", () => {
		expect(deleteRefusal({ lockedByAdmin: false, submittedByUserId: AUTHOR.id }, VIEWER)).toBe("forbidden");
		expect(deleteRefusal({ lockedByAdmin: false, submittedByUserId: AUTHOR.id }, AUTHOR)).toBeUndefined();
	});
});

type Host = Parameters<NonNullable<typeof plugin.setup>>[0];
type Route = Parameters<Host["routes"]["register"]>[0];
type RouteRequest = Parameters<Route["handler"]>[0];

interface SegmentBody {
	id: string;
	status: string;
}

interface ErrorBody {
	code: string;
}

/** A plugin host with in-memory storage that hands out copies, like the real store. */
async function startService() {
	const storage = new Map<string, unknown>();
	const markers = new Map<string, unknown>();
	const routes: Route[] = [];

	const host = {
		config: RULES,
		logger: { debug: () => undefined, info: () => undefined, warn: () => undefined, error: () => undefined },
		storage: {
			get: async (key: string) => (storage.has(key) ? structuredClone(storage.get(key)) : undefined),
			set: async (key: string, value: unknown) => storage.set(key, structuredClone(value)),
		},
		media: { get: async (id: string) => ({ id }) },
		markers: {
			set: async (mediaFileId: string, list: unknown) => markers.set(mediaFileId, structuredClone(list)),
		},
		realtime: { broadcast: () => undefined },
		routes: {
			register: async (route: Route) => routes.push(route),
		},
	};

	await plugin.setup(host as unknown as Host);
	return { routes, markers };
}

type Service = Awaited<ReturnType<typeof startService>>;

async function call(
	service: Service,
	method: string,
	path: string,
	request: { user: Viewer; query?: Record<string, string>; body?: unknown },
): Promise<{ status: number; body: unknown }> {
	const route = service.routes.find((candidate) => candidate.method === method && candidate.path === path);
	if (!route) throw new Error(`${method} ${path} is not registered`);

	const routeRequest: RouteRequest = { params: {}, query: request.query ?? {}, headers: {}, body: request.body, user: request.user };
	const response = await route.handler(routeRequest);
	return { status: response.status ?? 200, body: response.body };
}

async function submit(service: Service, user: Viewer = AUTHOR): Promise<string> {
	const response = await call(service, "POST", "/segments", {
		user,
		body: { mediaFileId: FILE, type: "intro", startSeconds: 0, endSeconds: 30 },
	});
	return (response.body as SegmentBody).id;
}

function vote(service: Service, user: Viewer, id: string, value: 1 | -1 | 0) {
	return call(service, "POST", "/segments/vote", { user, query: { id, mediaFileId: FILE }, body: { value } });
}

async function visibleIds(service: Service, user: Viewer): Promise<string[]> {
	const response = await call(service, "GET", "/segments", { user, query: { mediaFileId: FILE } });
	return (response.body as SegmentBody[]).map((segment) => segment.id);
}

describe("community markers service", () => {
	test("two downvotes hide a segment from the player and from other viewers, but not from its author", async () => {
		const service = await startService();
		const id = await submit(service);
		expect(service.markers.get(FILE)).toHaveLength(1);

		await vote(service, VIEWER, id, -1);
		expect(service.markers.get(FILE)).toHaveLength(1);

		const second = await vote(service, OTHER, id, -1);
		expect((second.body as SegmentBody).status).toBe("hidden");
		expect(service.markers.get(FILE)).toEqual([]);

		expect(await visibleIds(service, VIEWER)).toEqual([]);
		expect(await visibleIds(service, AUTHOR)).toEqual([id]);
		expect(await visibleIds(service, ADMIN)).toEqual([id]);
	});

	test("votes do not bring a hidden segment back", async () => {
		const service = await startService();
		const id = await submit(service);
		await vote(service, VIEWER, id, -1);
		await vote(service, OTHER, id, -1);

		const upvote = await vote(service, THIRD, id, 1);
		expect((upvote.body as SegmentBody).status).toBe("hidden");
		expect(await visibleIds(service, VIEWER)).toEqual([]);
	});

	test("an administrator decision is final: votes no longer hide the segment, and its author cannot delete it", async () => {
		const service = await startService();
		const id = await submit(service);

		const decided = await call(service, "PATCH", "/admin/segments", {
			user: ADMIN,
			query: { id, mediaFileId: FILE },
			body: { status: "approved" },
		});
		expect(decided.status).toBe(200);

		await vote(service, VIEWER, id, -1);
		await vote(service, OTHER, id, -1);
		expect(service.markers.get(FILE)).toHaveLength(1);

		const refused = await call(service, "DELETE", "/segments", { user: AUTHOR, query: { id, mediaFileId: FILE } });
		expect(refused.status).toBe(409);
		expect((refused.body as ErrorBody).code).toBe("segment.locked");

		const removed = await call(service, "DELETE", "/admin/segments", { user: ADMIN, query: { id, mediaFileId: FILE } });
		expect(removed.status).toBe(200);
	});

	test("only the author or an administrator can delete a segment", async () => {
		const service = await startService();
		const id = await submit(service);

		const refused = await call(service, "DELETE", "/segments", { user: VIEWER, query: { id, mediaFileId: FILE } });
		expect(refused.status).toBe(403);
		expect((refused.body as ErrorBody).code).toBe("segment.forbidden");
	});

	test("failed requests answer with an error status and a code", async () => {
		const service = await startService();

		const missing = await call(service, "POST", "/segments/vote", { user: VIEWER, query: { mediaFileId: FILE }, body: { value: 1 } });
		expect(missing.status).toBe(400);
		expect((missing.body as ErrorBody).code).toBe("segment.vote_params_required");

		const unknown = await vote(service, VIEWER, "missing", 1);
		expect(unknown.status).toBe(404);
		expect((unknown.body as ErrorBody).code).toBe("segment.not_found");
	});
});

describe("translations", () => {
	test("the Polish and English catalogues cover the same keys", () => {
		const en = getMessages("en");
		const pl = getMessages("pl-PL");

		expect(Object.keys(pl.errors).toSorted()).toEqual(Object.keys(en.errors).toSorted());
		expect(Object.keys(pl.statuses).toSorted()).toEqual(Object.keys(en.statuses).toSorted());
		expect(Object.keys(pl.types).toSorted()).toEqual(Object.keys(en.types).toSorted());
	});

	test("a failed request shows the translated text of its code, or the fallback", () => {
		const coded = Object.assign(new Error("HTTP 404: segment.not_found"), { code: "segment.not_found" });
		expect(errorText(getMessages("pl"), coded, "fallback")).toBe("Nie znaleziono segmentu.");
		expect(errorText(getMessages("en"), new Error("network down"), "fallback")).toBe("fallback");
		expect(errorText(getMessages("en"), Object.assign(new Error("x"), { code: "constructor" }), "fallback")).toBe("fallback");
	});
});
