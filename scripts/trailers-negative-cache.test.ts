import { describe, expect, test } from "bun:test";
import { isFreshNoTrailerEntry, NO_TRAILER_TTL_MS } from "../plugins/trailers/src/trailers-manager";

describe("trailers negative cache", () => {
	test("a no-trailer answer is reused until its TTL has passed", () => {
		const start = 1_000_000;
		const entry = { noTrailer: true, checkedAt: new Date(start).toISOString() };

		expect(isFreshNoTrailerEntry(entry, start + NO_TRAILER_TTL_MS - 1)).toBe(true);
		expect(isFreshNoTrailerEntry(entry, start + NO_TRAILER_TTL_MS)).toBe(false);
	});

	test("trailer entries and damaged records are never treated as no-trailer answers", () => {
		expect(isFreshNoTrailerEntry({ trailerKey: "abc", mediaType: "movie" }, 0)).toBe(false);
		expect(isFreshNoTrailerEntry({ noTrailer: true, checkedAt: "not-a-date" }, 0)).toBe(false);
		expect(isFreshNoTrailerEntry(null, 0)).toBe(false);
	});
});
