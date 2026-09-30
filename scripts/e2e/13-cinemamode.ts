import { existsSync, renameSync } from "node:fs";
import { join } from "node:path";
import { Api, expectWait } from "./lib/client";
import { generateClip } from "./lib/media";
import { ensure, Suite } from "./lib/report";
import { MOVIES_DIR, readState, STAGING_DIR } from "./lib/state";

const suite = new Suite("13-cinemamode");

interface PreRoll {
	entries?: { key?: string; youtubeKey?: string }[];
	enabled?: boolean;
	config?: { enabled: boolean; trailerCount: number; libraryOnly: boolean };
}

const ANCHOR = "The Matrix (1999).mp4";
const ANCHOR_TITLE = "The Matrix";
const PAIR = "Terminator Genisys (2015).mp4";
const PAIR_TITLE = "Terminator Genisys";

async function ensureMatchedLibraryFile(admin: Api, filename: string, title: string, libraryId: string): Promise<string | null> {
	const target = join(MOVIES_DIR, filename);
	if (!existsSync(target)) {
		const staged = join(STAGING_DIR, filename);
		await generateClip(suite, staged, 20);
		renameSync(staged, target);
		await admin.post(`/v1/libraries/${libraryId}/scan`, {});
	}
	return await expectWait(
		async () => {
			const response = await admin.get<{ data?: { id: string; metadataId?: string | null; fileName?: string }[] }>("/v1/media-files", {
				query: { libraryId, pageSize: 100 },
			});
			const items = Array.isArray(response.body) ? response.body : (response.body.data ?? []);
			const match = items.find((item) => item.metadataId && (item.fileName ?? "").includes(filename.replace(".mp4", "")));
			if (!match) return null;
			const metadata = await admin.get<{ title?: string }>(`/v1/metadata/${match.metadataId}`);
			return metadata.body.title === title ? match.id : null;
		},
		`library match for ${filename}`,
		150_000,
		3_000,
	);
}

async function main(): Promise<void> {
	const state = ensure(readState(), "run 00-bootstrap first");
	const admin = new Api().withCookie(state.adminCookie);
	const userA = new Api().withCookie(state.userACookie);

	const anchorId = await suite.case("Matrix + Reloaded matched in library (pre-roll needs real pair)", async (s) => {
		const anchor = await ensureMatchedLibraryFile(admin, ANCHOR, ANCHOR_TITLE, state.moviesLibraryId as string);
		s.expect(Boolean(anchor), `${ANCHOR_TITLE} not matched in library`);
		const pair = await ensureMatchedLibraryFile(admin, PAIR, PAIR_TITLE, state.moviesLibraryId as string);
		s.expect(Boolean(pair), `${PAIR_TITLE} not matched in library (TMDB rec/similar pair may have changed)`);
		return anchor as string;
	});

	await suite.case("pre-roll without mediaFileId -> 400", async (s) => {
		const response = await userA.get<object>("/v1/plugins/org.reelvault.cinemamode/pre-roll");
		s.expect(response.status === 400, `expected 400, got ${response.status}`);
	});

	await suite.case("pre-roll returns trailers for a library movie with owned recommendations", async (s) => {
		const response = await userA.get<PreRoll>("/v1/plugins/org.reelvault.cinemamode/pre-roll", { mediaFileId: anchorId });
		s.expect(response.status === 200, `pre-roll -> ${response.status} ${JSON.stringify(response.body)}`);
		const entries = response.body.entries ?? [];
		s.expect(
			entries.length > 0 && entries.length <= 3,
			`expected 1-3 trailers, got ${entries.length}: ${JSON.stringify(response.body).slice(0, 150)}`,
		);
		s.expect(
			entries.every((entry) => Boolean(entry.key)),
			"entry missing youtube key",
		);
	});

	await suite.case("user cannot call admin preview", async (s) => {
		const response = await userA.get<object>("/v1/plugins/org.reelvault.cinemamode/preview", { mediaFileId: anchorId });
		s.expect(response.status === 403, `expected 403, got ${response.status}`);
	});

	await suite.case("admin preview reports config", async (s) => {
		const response = await admin.get<PreRoll>("/v1/plugins/org.reelvault.cinemamode/preview", { mediaFileId: anchorId });
		s.expect(response.status === 200, `preview -> ${response.status}`);
		s.expect(response.body.config?.enabled === true, `preview config enabled=${response.body.config?.enabled}`);
		s.expect(response.body.config?.trailerCount === 3, `preview trailerCount=${response.body.config?.trailerCount}`);
	});

	await suite.case("enabled=false turns pre-roll off; re-enable preserves secret", async (s) => {
		const off = await admin.put("/v1/admin/plugins/org.reelvault.cinemamode/config", {
			cookie: state.adminCookie,
			body: { enabled: false },
		});
		s.expect(off.status === 200, `disable -> ${off.status}`);
		await Bun.sleep(500);
		const disabled = await userA.get<PreRoll>("/v1/plugins/org.reelvault.cinemamode/pre-roll", { mediaFileId: anchorId });
		s.expect(disabled.status === 200, `pre-roll while disabled -> ${disabled.status}`);
		s.expect((disabled.body.entries ?? []).length === 0, `disabled pre-roll still returned ${disabled.body.entries?.length} trailers`);
		const on = await admin.put("/v1/admin/plugins/org.reelvault.cinemamode/config", { cookie: state.adminCookie, body: { enabled: true } });
		s.expect(on.status === 200, `re-enable -> ${on.status}`);
		await Bun.sleep(800);
		const enabled = await userA.get<PreRoll>("/v1/plugins/org.reelvault.cinemamode/pre-roll", { mediaFileId: anchorId });
		s.expect(
			(enabled.body.entries ?? []).length > 0,
			`pre-roll empty after re-enable (secret lost?): ${JSON.stringify(enabled.body).slice(0, 150)}`,
		);
	});

	await suite.finish();
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
