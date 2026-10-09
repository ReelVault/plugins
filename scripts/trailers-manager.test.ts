import { describe, expect, test } from "bun:test";
import { TrailersManager } from "../plugins/trailers/src/trailers-manager";

type Host = ConstructorParameters<typeof TrailersManager>[0];
type Config = ConstructorParameters<typeof TrailersManager>[1];

const VIDEO = {
	id: "v1",
	iso_639_1: "en",
	iso_3166_1: "US",
	key: "abc123",
	name: "Official Trailer",
	site: "YouTube",
	size: 1080,
	type: "Trailer",
	official: true,
	published_at: "2020-01-01T00:00:00.000Z",
};

/** Library titles and their TMDB ids. */
const TITLES: Record<string, { type: "movie" | "tv_show"; tmdbId: string }> = {
	"meta-1": { type: "movie", tmdbId: "62" },
	"meta-2": { type: "movie", tmdbId: "99" },
	"meta-3": { type: "movie", tmdbId: "7" },
};

/** TMDB video paths that have a trailer; every other path answers with an empty video list. */
const TRAILER_PATHS = new Set(["/3/movie/62/videos", "/3/movie/7/videos"]);

function metadataFor(id: string) {
	const title = TITLES[id];
	if (!title) return null;

	return {
		id,
		title: id,
		type: title.type,
		releaseDate: "1979-05-25",
		externalIds: [{ providerId: "tmdb", externalId: title.tmdbId }],
	};
}

/** Answers a TMDB request locally and records the path that was asked for. */
function tmdbResponse(input: string, requested: string[]): Response {
	const url = new URL(input);
	requested.push(url.pathname);

	const results = TRAILER_PATHS.has(url.pathname) ? [VIDEO] : [];
	return new Response(JSON.stringify({ results }), { headers: { "content-type": "application/json" } });
}

/** A plugin host with in-memory storage that hands out copies, like the real store. */
function createHost(storage: Map<string, unknown>, requested: string[]) {
	const config: Config = { apiKey: "test-key", preferredLanguage: "en-US" };

	return {
		config,
		logger: { debug: () => undefined, info: () => undefined, warn: () => undefined, error: () => undefined },
		storage: {
			get: async (key: string) => (storage.has(key) ? structuredClone(storage.get(key)) : undefined),
			set: async (key: string, value: unknown) => storage.set(key, structuredClone(value)),
		},
		metadata: { get: async (id: string) => metadataFor(id) },
		http: { fetch: async (input: string | URL) => tmdbResponse(String(input), requested) },
	};
}

function createManager(storage = new Map<string, unknown>(), requested: string[] = []) {
	const host = createHost(storage, requested);
	const manager = new TrailersManager(host as unknown as Host, host.config);
	return { manager, requested };
}

describe("trailers manager", () => {
	test("a discovered trailer is fetched through the host HTTP capability and counted", async () => {
		const { manager, requested } = createManager();

		const trailer = await manager.getTrailer("meta-1");

		expect(trailer?.trailerKey).toBe("abc123");
		expect(requested).toEqual(["/3/movie/62/videos"]);
		expect(await manager.getStats()).toEqual({ cachedCount: 1, moviesCount: 1, showsCount: 0 });
	});

	test("a title without a trailer is remembered and not looked up again while the entry is fresh", async () => {
		const { manager, requested } = createManager();

		expect(await manager.getTrailer("meta-2")).toBeNull();
		expect(await manager.getTrailer("meta-2")).toBeNull();

		expect(requested).toEqual(["/3/movie/99/videos"]);
	});

	test("trailers cached before the counts existed are counted once, then kept up to date", async () => {
		const storage = new Map<string, unknown>([
			["trailers_index", ["meta-a", "meta-b"]],
			["trailer_meta_meta-a", { metadataId: "meta-a", mediaType: "movie", trailerKey: "k1" }],
			["trailer_meta_meta-b", { metadataId: "meta-b", mediaType: "tv_show", trailerKey: "k2" }],
		]);
		const { manager, requested } = createManager(storage);

		expect(await manager.getStats()).toEqual({ cachedCount: 2, moviesCount: 1, showsCount: 1 });

		await manager.getTrailer("meta-3");

		expect(await manager.getStats()).toEqual({ cachedCount: 3, moviesCount: 2, showsCount: 1 });
		expect(requested).toEqual(["/3/movie/7/videos"]);
	});
});
