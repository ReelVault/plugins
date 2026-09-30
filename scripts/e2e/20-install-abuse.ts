import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { strToU8, zipSync } from "fflate";
import { Api } from "./lib/client";
import { ensure, Suite } from "./lib/report";
import { PLUGINS_DIST, readState } from "./lib/state";

const suite = new Suite("20-install-abuse");

const TMP = "/tmp/rv-plugins-e2e/abuse";

function validManifest(): Record<string, unknown> {
	return {
		id: "org.e2e.dummy",
		name: "E2E Dummy",
		version: "1.0.0",
		entry: "./index.js",
		capabilities: ["httpRoute"],
	};
}

async function upload(admin: Api, path: string): Promise<number> {
	const form = new FormData();
	form.append("file", Bun.file(path));
	const response = await admin.post<object>("/v1/admin/plugins/install-upload", { form });
	return response.status;
}

async function reinstall(admin: Api): Promise<number> {
	const form = new FormData();
	form.append("file", Bun.file(join(PLUGINS_DIST, "org.reelvault.trailers", "org.reelvault.trailers-1.0.0.zip")));
	const response = await admin.post<object>("/v1/admin/plugins/install-upload", { form });
	return response.status;
}

async function main(): Promise<void> {
	const state = ensure(readState(), "run 00-bootstrap first");
	const admin = new Api().withCookie(state.adminCookie);

	await suite.case("garbage text file is rejected", async (s) => {
		const path = join(TMP, "garbage.bin");
		writeFileSync(path, "this is not an archive at all");
		const status = await upload(admin, path);
		s.expect(status === 400 || status === 422, `garbage file accepted with ${status}`);
	});

	await suite.case("empty file is rejected", async (s) => {
		const path = join(TMP, "empty.bin");
		writeFileSync(path, new Uint8Array(0));
		const status = await upload(admin, path);
		s.expect(status === 400 || status === 422, `empty file accepted with ${status}`);
	});

	await suite.case("rar-magic renamed to .zip is rejected", async (s) => {
		const path = join(TMP, "fake.zip");
		const rar = new Uint8Array(16);
		rar.set([0x52, 0x61, 0x72, 0x21, 0x1a, 0x07], 0);
		writeFileSync(path, rar);
		const status = await upload(admin, path);
		s.expect(status === 400 || status === 422, `rar-magic accepted with ${status}`);
	});

	await suite.case("zip without plugin.json is rejected", async (s) => {
		const path = join(TMP, "no-manifest.zip");
		const zipped = zipSync({ "readme.txt": strToU8("no manifest here") });
		writeFileSync(path, zipped);
		const status = await upload(admin, path);
		s.expect(status === 400 || status === 422, `manifest-less zip accepted with ${status}`);
	});

	await suite.case("zip with invalid manifest id is rejected", async (s) => {
		const path = join(TMP, "bad-id.zip");
		const manifest = { ...validManifest(), id: "../escape" };
		const zipped = zipSync({
			"org.e2e.dummy/plugin.json": strToU8(JSON.stringify(manifest)),
			"org.e2e.dummy/index.js": strToU8("export default {}"),
		});
		writeFileSync(path, zipped);
		const status = await upload(admin, path);
		s.expect(status === 400 || status === 422, `bad id accepted with ${status}`);
	});

	await suite.case("path traversal entry is rejected", async (s) => {
		const path = join(TMP, "traversal.zip");
		const manifest = validManifest();
		const zipped = zipSync({
			"org.e2e.dummy/plugin.json": strToU8(JSON.stringify(manifest)),
			"org.e2e.dummy/index.js": strToU8("export default {}"),
			"org.e2e.dummy/../../evil.txt": strToU8("pwned"),
		});
		writeFileSync(path, zipped);
		const status = await upload(admin, path);
		s.expect(status === 400 || status === 422, `traversal zip accepted with ${status}`);
	});

	await suite.case("zip bomb is rejected", async (s) => {
		const path = join(TMP, "bomb.zip");
		const huge = new Uint8Array(600 * 1024 * 1024).fill(0);
		const zipped = zipSync({ "org.e2e.dummy/blob.bin": huge }, { level: 9 });
		writeFileSync(path, zipped);
		const status = await upload(admin, path);
		s.expect(status === 400 || status === 422 || status === 413, `zip bomb accepted with ${status}`);
	});

	await suite.case("truncated zip is rejected", async (s) => {
		const full = zipSync({ "readme.txt": strToU8("truncate me please") });
		const path = join(TMP, "truncated.zip");
		writeFileSync(path, full.slice(0, Math.floor(full.length / 2)));
		const status = await upload(admin, path);
		s.expect(status === 400 || status === 422, `truncated zip accepted with ${status}`);
	});

	await suite.case("duplicate upload of installed plugin upgrades idempotently", async (s) => {
		const zipPath = join(PLUGINS_DIST, "org.reelvault.trailers", "org.reelvault.trailers-1.0.0.zip");
		const first = await upload(admin, zipPath);
		const second = await upload(admin, zipPath);
		s.expect(first === 200 || first === 201, `first upload -> ${first}`);
		s.expect(second === 200 || second === 201, `second upload -> ${second}`);
		const plugins = await admin.get<Array<{ id: string; state: string }>>("/v1/admin/plugins");
		s.expect(
			plugins.body.find((plugin) => plugin.id === "org.reelvault.trailers")?.state === "enabled",
			"trailers not enabled after double upload",
		);
	});

	await suite.case("uninstall removes routes; reinstall restores them", async (s) => {
		const probe = await admin.get("/v1/plugins/org.reelvault.trailers/stats");
		s.expect(probe.status === 200, `pre-uninstall route -> ${probe.status}`);
		const removed = await admin.post("/v1/admin/plugins/org.reelvault.trailers/uninstall");
		s.expect(removed.status === 200 || removed.status === 403, `uninstall -> ${removed.status} ${JSON.stringify(removed.body)}`);
		if (removed.status === 403) return;
		const gone = await admin.get("/v1/plugins/org.reelvault.trailers/stats");
		s.expect(gone.status === 404, `route after uninstall -> ${gone.status}`);
		let reinstalled = await reinstall(admin);
		let waits = 0;
		while (reinstalled === 429 && waits < 3) {
			waits += 1;
			await Bun.sleep(20_000);
			reinstalled = await reinstall(admin);
		}
		s.expect(reinstalled === 200 || reinstalled === 201, `reinstall -> ${reinstalled} after ${waits} waits`);
		await Bun.sleep(800);
		const restored = await admin.get("/v1/plugins/org.reelvault.trailers/stats");
		s.expect(restored.status === 200, `route after reinstall -> ${restored.status}`);
	});

	await suite.finish();
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
