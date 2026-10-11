import { describe, expect, test } from "bun:test";
import { searchMovie } from "../plugins/tmdb/src/routes/search-movie";
import { searchSeries } from "../plugins/tmdb/src/routes/search-series";
import type { TMDBApi } from "../plugins/tmdb/src/tmdb";

type Hit = Record<string, unknown>;

const movie = { id: 603, title: "The Matrix", release_date: "1999-03-31" };
const show = { id: 1396, name: "Breaking Bad", first_air_date: "2008-01-20" };

/** Fake TMDB client: records the language of every search and answers with fixed hits. */
function fakeClient(hits: Hit[], calls: string[], fails = false) {
	const respond = (language: string) => {
		calls.push(language);
		return fails ? Promise.reject(new Error("network down")) : Promise.resolve({ results: hits });
	};
	return {
		search: {
			movies: (params: { language: string }) => respond(params.language),
			tv_series: (params: { language: string }) => respond(params.language),
		},
	};
}

function fakeApi(opts: { primary: Hit[]; fallback?: Hit[]; fallbackFails?: boolean; calls: string[] }) {
	return {
		client: fakeClient(opts.primary, opts.calls),
		fallbackClient: opts.fallback ? fakeClient(opts.fallback, opts.calls, opts.fallbackFails) : undefined,
		searchLanguage: "pl-PL",
		fallbackLanguage: "en-US",
		getImagePath: () => undefined,
	} as unknown as TMDBApi;
}

describe("tmdb search fallback", () => {
	test("movies: a hit in the requested language is returned without a fallback search", async () => {
		const calls: string[] = [];
		const results = await searchMovie(fakeApi({ primary: [movie], fallback: [movie], calls }), "matrix");

		expect(results.map((r) => r.externalId)).toEqual(["603"]);
		expect(calls).toEqual(["pl-PL"]);
	});

	test("movies: nothing in the requested language searches the fallback language", async () => {
		const calls: string[] = [];
		const results = await searchMovie(fakeApi({ primary: [], fallback: [movie], calls }), "matrix");

		expect(results.map((r) => r.externalId)).toEqual(["603"]);
		expect(calls).toEqual(["pl-PL", "en-US"]);
	});

	test("movies: a failing fallback search keeps the empty result", async () => {
		const calls: string[] = [];
		const results = await searchMovie(fakeApi({ primary: [], fallback: [movie], fallbackFails: true, calls }), "matrix");

		expect(results).toEqual([]);
		expect(calls).toEqual(["pl-PL", "en-US"]);
	});

	test("movies: without a fallback client an empty search stays empty", async () => {
		const calls: string[] = [];
		const results = await searchMovie(fakeApi({ primary: [], calls }), "matrix");

		expect(results).toEqual([]);
		expect(calls).toEqual(["pl-PL"]);
	});

	test("series: nothing in the requested language searches the fallback language", async () => {
		const calls: string[] = [];
		const results = await searchSeries(fakeApi({ primary: [], fallback: [show], calls }), "breaking");

		expect(results.map((r) => r.externalId)).toEqual(["1396"]);
		expect(calls).toEqual(["pl-PL", "en-US"]);
	});

	test("series: a hit in the requested language is returned without a fallback search", async () => {
		const calls: string[] = [];
		const results = await searchSeries(fakeApi({ primary: [show], fallback: [show], calls }), "breaking");

		expect(results.map((r) => r.externalId)).toEqual(["1396"]);
		expect(calls).toEqual(["pl-PL"]);
	});
});
