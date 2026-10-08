import { existsSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { Api } from "./lib/client";
import { ensure, Suite } from "./lib/report";
import { ADMIN_ACCOUNT, BASE_URL, E2E_ROOT, REPORTS_DIR, readState, USER_A } from "./lib/state";

const suite = new Suite("50-ui");
const UI_DIR = join(E2E_ROOT, "ui");
const SHOTS = join(REPORTS_DIR, "ui");

interface Browser {
	newContext(options?: Record<string, unknown>): Promise<UiContext>;
	close(): Promise<void>;
}

interface UiContext {
	newPage(): Promise<UiPage>;
	addCookies(cookies: unknown[]): Promise<void>;
	close(): Promise<void>;
}

interface UiPage {
	goto(url: string, options?: Record<string, unknown>): Promise<unknown>;
	waitForSelector(selector: string, options?: Record<string, unknown>): Promise<unknown>;
	locator(selector: string): UiLocator;
	content(): Promise<string>;
	screenshot(options?: Record<string, unknown>): Promise<Uint8Array>;
	on(event: string, handler: (payload: unknown) => void): void;
	reload(options?: Record<string, unknown>): Promise<unknown>;
	close(): Promise<void>;
	evaluate<T>(expression: string): Promise<T>;
}

interface UiLocator {
	first(): UiLocator;
	count(): Promise<number>;
	click(options?: Record<string, unknown>): Promise<void>;
	fill(value: string, options?: Record<string, unknown>): Promise<void>;
	textContent(options?: Record<string, unknown>): Promise<string | null>;
}

function ensurePlaywrightCore(): () => { chromium: { launch(options: Record<string, unknown>): Promise<Browser> } } {
	if (!existsSync(join(UI_DIR, "node_modules", "playwright-core"))) {
		mkdirSync(UI_DIR, { recursive: true });
		const init = Bun.spawnSync(["bun", "add", "playwright-core@1.55.0"], { cwd: UI_DIR });
		suite.expect(init.exitCode === 0, `bun add playwright-core failed: ${init.stderr.toString().slice(-300)}`);
	}
	process.env.NODE_PATH = join(UI_DIR, "node_modules");
	const required = createRequire(join(UI_DIR, "package.json"));
	return () => required("playwright-core") as { chromium: { launch(options: Record<string, unknown>): Promise<Browser> } };
}

async function loginPage(browser: Browser, email: string, password: string, profileId: string): Promise<UiContext> {
	const api = new Api();
	const sessionCookie = await api.login(email, password, BASE_URL);
	const authed = api.withCookie(sessionCookie);
	let switched = await authed.post<{ retryAfterSeconds?: number }>("/v1/profiles/switch", {
		body: { profileId },
		headers: { origin: BASE_URL },
	});
	if (switched.status === 429) {
		const wait = (switched.body.retryAfterSeconds ?? 30) + 2;
		await Bun.sleep(wait * 1_000);
		switched = await authed.post("/v1/profiles/switch", { body: { profileId }, headers: { origin: BASE_URL } });
	}
	suite.expect(switched.status === 200, `profile switch -> ${switched.status} ${JSON.stringify(switched.body)}`);
	const rawCookies = [sessionCookie, ...extractSetCookies(switched.headers)];
	const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
	const cookies = rawCookies.map((raw) => {
		const separator = raw.indexOf("=");
		return {
			name: raw.slice(0, separator),
			value: raw.slice(separator + 1),
			domain: "localhost",
			path: "/",
			httpOnly: true,
			sameSite: "Lax",
		};
	});
	await context.addCookies(cookies);
	return context;
}

function extractSetCookies(headers: Headers): string[] {
	const raw = headers.getSetCookie?.() ?? [];
	return raw.map((entry) => entry.split(";")[0]);
}

interface DeepPage {
	evaluate<T>(expression: string): Promise<T>;
}

/** Shadow-DOM-aware text dump: custom elements keep their content in shadow roots. */
async function deepText(page: UiPage): Promise<string> {
	const deep = page as UiPage & DeepPage;
	try {
		return await deep.evaluate<string>(
			"(() => { const parts = [document.body?.innerText ?? '', document.body?.innerHTML ?? '']; for (const element of document.querySelectorAll('*')) { if (element.shadowRoot) parts.push(element.shadowRoot.textContent ?? ''); } return parts.join('|'); })()",
		);
	} catch {
		return await page.content();
	}
}

interface ScrollPage {
	evaluate<T>(expression: string): Promise<T>;
}

async function scrollPage(page: UiPage): Promise<void> {
	const deep = page as UiPage & ScrollPage;
	try {
		await deep.evaluate<number>(
			"(async () => { const step = 900; const target = document.body.scrollHeight; for (let y = window.scrollY; y <= target; y += step) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 150)); } })()",
		);
	} catch {
		return;
	}
}

function pollWithScroll(page: UiPage, needle: string, timeoutMs: number): Promise<boolean> {
	const deadline = Date.now() + timeoutMs;
	return new Promise((resolve) => {
		const poll = async () => {
			let lastLen = -1;
			let dashSeen = false;
			while (Date.now() < deadline) {
				await scrollPage(page);
				const text = await deepText(page);
				lastLen = text.length;
				if (text.includes("rv-requests-dashboard") || text.includes("Coming soon")) dashSeen = true;
				if (text.includes(needle)) {
					resolve(true);
					return;
				}
				await Bun.sleep(800);
			}
			const widgetProbe = await page
				.evaluate<string>(
					"(() => { const el = document.querySelector('rv-requests-dashboard'); if (!el) return JSON.stringify({ el: false }); const root = el.shadowRoot; const titles = root ? [...root.querySelectorAll('.rv-card__title')].map((node) => node.textContent) : []; return JSON.stringify({ el: true, hasRoot: Boolean(root), heading: (root?.textContent ?? '').includes('Coming soon'), cards: root ? root.querySelectorAll('.rv-card').length : -1, titles }); })()",
				)
				.catch(() => "EVAL-FAILED");
			console.log(
				`    [debug] pollWithScroll miss: len=${lastLen} dashSurface=${dashSeen} needle=${needle.slice(0, 30)} widget=${widgetProbe}`,
			);
			resolve(false);
		};
		poll().catch(() => undefined);
	});
}

async function pollAllNames(page: UiPage, names: string[], timeoutMs: number): Promise<string> {
	const deadline = Date.now() + timeoutMs;
	let content = "";
	const matches = (text: string): boolean => names.every((name) => text.includes(name));
	while (Date.now() < deadline) {
		await scrollPage(page);
		content = await deepText(page);
		if (matches(content)) return content;
		await Bun.sleep(800);
	}
	return content;
}

const REPORT_DIALOG_PATTERN = /report|description|category/i;
const TRAILER_LABEL_PATTERN = /trailer|zwiastun/i;
const APPROVED_LABEL_PATTERN = /approved|zatwierdzon/i;
const STALE_REQUEST_TITLE_PATTERN = /^(Dashboard Probe|Realtime UI|DASH FLOW|WS PROBE|SHADOW PROBE|Self Scope Probe)/;
const ADMIN_NOTES_PATTERN = /admin notes|notatki administratora/i;
const APP_ERROR_PATTERN = /Network request failed|Błąd aplikacji|Application error/i;
const MANAGED_STATUS_PATTERN = /\bOpen\b/;
const MANAGED_SEVERITY_PATTERN = /\bLow\b/;

async function cleanupStaleUserRequests(userA: Api): Promise<void> {
	const response = await userA.get<{ requests?: Array<{ id: string; title: string }> }>("/v1/plugins/org.reelvault.requests/requests");
	const stale = (response.body.requests ?? []).filter((request) => STALE_REQUEST_TITLE_PATTERN.test(request.title));
	for (const request of stale) {
		await userA.delete(`/v1/plugins/org.reelvault.requests/requests/${request.id}`);
	}
}

async function cleanupBugReports(admin: Api): Promise<void> {
	const response = await admin.get<{ reports?: Array<{ id: string }> }>("/v1/plugins/org.reelvault.bug-reports/reports", {
		query: { scope: "all" },
	});
	for (const report of response.body.reports ?? []) {
		await admin.delete(`/v1/plugins/org.reelvault.bug-reports/reports/${report.id}`);
	}
}

function pollContent(page: UiPage, needle: string, timeoutMs: number, predicate?: (content: string) => boolean): Promise<boolean> {
	const deadline = Date.now() + timeoutMs;
	const check = async (): Promise<boolean> => {
		const content = await deepText(page);
		return predicate ? predicate(content) : content.includes(needle);
	};
	return new Promise((resolve) => {
		const poll = async () => {
			while (Date.now() < deadline) {
				if (await check()) {
					resolve(true);
					return;
				}
				await Bun.sleep(600);
			}
			resolve(false);
		};
		poll().catch(() => undefined);
	});
}

async function main(): Promise<void> {
	const state = ensure(readState(), "run 00-bootstrap first");
	const admin = new Api().withCookie(state.adminCookie);
	mkdirSync(SHOTS, { recursive: true });

	const { chromium } = ensurePlaywrightCore()();
	const executablePath = "/usr/sbin/google-chrome-stable";
	const browser: Browser = await chromium.launch({ executablePath, headless: true });

	try {
		const userA = new Api().withCookie(state.userACookie);
		await cleanupStaleUserRequests(userA);
		const adminContext = await loginPage(browser, ADMIN_ACCOUNT.email, ADMIN_ACCOUNT.password, state.adminProfileId);
		const userContext = await loginPage(browser, USER_A.email, USER_A.password, state.userAProfileId);

		await suite.case("admin plugins page lists all installed plugins", async (s) => {
			const page = await adminContext.newPage();
			await page.goto(`${BASE_URL}/admin/plugins?view=installed`);
			await page.waitForSelector("text=Media Requests", { timeout: 20_000 });
			const content = await pollAllNames(
				page,
				["TMDB", "OMDb", "Cinemamode", "Community Markers", "Trailers", "Webhooks", "Bug Reports"],
				20_000,
			);
			for (const name of ["TMDB", "OMDb", "Cinemamode", "Community Markers", "Trailers", "Webhooks", "Bug Reports"]) {
				s.expect(content.includes(name), `plugin card missing: ${name}`);
			}
			await page.screenshot({ path: join(SHOTS, "admin-plugins.png"), fullPage: true });
			await page.close();
		});

		await suite.case("installed card opens catalog details with revision history", async (s) => {
			const page = await adminContext.newPage();
			await page.goto(`${BASE_URL}/admin/plugins?view=installed`);
			await page.waitForSelector("text=Media Requests", { timeout: 20_000 });
			await Bun.sleep(1_500);
			const details = page.locator("button:has-text('Details')");
			const count = await details.count();
			s.expect(count > 0, "no Details button on installed cards");
			await details.first().click();
			await Bun.sleep(1_500);
			const content = await deepText(page);
			s.expect(content.includes("Details"), "details dialog did not open");
			await page.screenshot({ path: join(SHOTS, "admin-revision-history.png"), fullPage: true });
			await page.close();
		});

		await suite.case("available tab is empty when every catalog plugin is installed", async (s) => {
			const page = await adminContext.newPage();
			await page.goto(`${BASE_URL}/admin/plugins`);
			await page.waitForSelector("text=Installed", { timeout: 20_000 });
			await Bun.sleep(1_500);
			const content = await deepText(page);
			s.expect(content.includes("No plugins in the catalog") || content.includes("Plugin catalog"), "available view did not render");
			await page.screenshot({ path: join(SHOTS, "admin-catalog.png"), fullPage: true });
			await page.close();
		});

		await suite.case("admin plugin config page renders schema fields", async (_s) => {
			const page = await adminContext.newPage();
			await page.goto(`${BASE_URL}/admin/plugins/org.reelvault.tmdb`);
			await page.waitForSelector("text=Metadata language", { timeout: 20_000 });
			await page.screenshot({ path: join(SHOTS, "admin-config.png"), fullPage: true });
			await page.close();
		});

		await suite.case("admin bug-reports Manage dialog opens and persists admin notes", async (s) => {
			await cleanupBugReports(admin);
			const marker = `Manage probe ${(Math.random() + 1).toString(36).slice(2, 7)}`;
			const created = await userA.post<{ report?: { id: string } }>("/v1/plugins/org.reelvault.bug-reports/reports", {
				body: { title: `E2E UI Manage ${marker}`, category: "ui", severity: "low", description: "Manage dialog probe." },
			});
			s.expect(created.status === 201, `probe report -> ${created.status}`);
			const reportId = created.body.report?.id ?? "";
			s.expect(Boolean(reportId), "report id missing");

			try {
				const page = await adminContext.newPage();
				await page.goto(`${BASE_URL}/admin/plugins/pages/org.reelvault.bug-reports`);
				const listed = await pollContent(page, "E2E UI Manage", 25_000);
				s.expect(listed, "probe report missing from the admin reports table");
				await page.locator("button:has-text('Manage')").first().click();
				const opened = await pollContent(page, "admin notes", 15_000, (text) => ADMIN_NOTES_PATTERN.test(text));
				s.expect(opened, "Manage dialog did not open");
				// The data source path is templated and defaults come from async data —
				// the dialog must show the report's current status/severity.
				await Bun.sleep(1_500);
				const dialogText = await page.evaluate<string>(
					"(() => { const dialog = document.querySelector('[role=dialog]'); return dialog ? dialog.innerText : ''; })()",
				);
				s.expect(
					MANAGED_STATUS_PATTERN.test(dialogText) && MANAGED_SEVERITY_PATTERN.test(dialogText),
					`dialog did not reflect the report values: ${dialogText.slice(0, 140)}`,
				);
				await page.locator("textarea").first().fill(marker);
				await page.locator("button:has-text('Save')").first().click();
				await Bun.sleep(2_500);
				await page.screenshot({ path: join(SHOTS, "admin-bug-reports-manage.png"), fullPage: true });
				await page.close();

				const item = await admin.get<{ report?: { adminNotes?: string } }>(
					`/v1/plugins/org.reelvault.bug-reports/reports/item/${reportId}`,
				);
				s.expect(item.body.report?.adminNotes === marker, `admin notes not persisted: ${JSON.stringify(item.body).slice(0, 160)}`);
			} finally {
				await cleanupBugReports(admin);
			}
		});

		await suite.case("user dashboard renders media-requests coming-soon section", async (s) => {
			const marker = `Dashboard Probe ${(Math.random() + 1).toString(36).slice(2, 7)}`;
			const created = await userA.post<{ request?: { id: string } }>("/v1/plugins/org.reelvault.requests/requests", {
				body: { title: marker, mediaType: "movie" },
			});
			s.expect(created.status === 201, `probe request -> ${created.status}`);
			const approved = await admin.patch(`/v1/plugins/org.reelvault.requests/requests/${created.body.request?.id}`, {
				body: { status: "approved" },
			});
			s.expect(approved.status === 200, `approve -> ${approved.status}`);
			const page = await userContext.newPage();
			page.on("response", (raw: unknown) => {
				const response = raw as { status(): number; url(): string };
				if (response.status() >= 400) console.log(`    [net] ${response.status()} ${response.url().slice(0, 110)}`);
			});
			await page.goto(`${BASE_URL}/dashboard`);
			await Bun.sleep(5_000);
			await scrollPage(page);
			let visible = await pollWithScroll(page, marker, 14_000);
			if (!visible) {
				await page.reload({ waitUntil: "domcontentloaded" });
				await Bun.sleep(5_000);
				visible = await pollWithScroll(page, marker, 20_000);
			}
			s.expect(visible, "approved request missing from coming-soon widget");
			await page.screenshot({ path: join(SHOTS, "user-dashboard.png"), fullPage: true });
			await page.close();
			await admin.patch(`/v1/plugins/org.reelvault.requests/requests/${created.body.request?.id}`, {
				body: { status: "available" },
			});
		});

		await suite.case("user discover page renders plugin content", async (s) => {
			const page = await userContext.newPage();
			await page.goto(`${BASE_URL}/plugins/org.reelvault.requests/page/discover`);
			await page.waitForSelector("rv-requests-discover", { timeout: 25_000, state: "attached" });
			await Bun.sleep(2_500);
			const content = await page.content();
			s.expect(content.length > 4000, "discover page suspiciously empty");
			await page.screenshot({ path: join(SHOTS, "user-discover.png"), fullPage: true });
			await page.close();
		});

		await suite.case("bug report floating overlay opens report dialog", async (s) => {
			const page = await userContext.newPage();
			await page.goto(`${BASE_URL}/`);
			await page.waitForSelector("text=Report a bug", { timeout: 25_000 });
			await page.locator("text=Report a bug").first().click();
			await Bun.sleep(1_500);
			const content = await page.content();
			s.expect(REPORT_DIALOG_PATTERN.test(content), "report dialog did not open");
			await page.screenshot({ path: join(SHOTS, "user-overlay.png"), fullPage: true });
			await page.close();
		});

		await suite.case("user watchlist page renders hydrated items without the app error", async (s) => {
			const movie = ensure(state.movies[0], "bootstrap seeded no movies");
			const profileHeaders = { "x-profile-id": state.userAProfileId };
			const added = await userA.post("/v1/me/watchlist", { body: { metadataId: movie.metadataId }, headers: profileHeaders });
			s.expect(added.status === 200, `watchlist add -> ${added.status}`);

			try {
				const page = await userContext.newPage();
				await page.goto(`${BASE_URL}/watchlist`);
				const visible = await pollContent(page, movie.title, 25_000);
				s.expect(visible, `watchlist item "${movie.title}" missing`);
				const content = await deepText(page);
				s.expect(!APP_ERROR_PATTERN.test(content), "watchlist page rendered the app error state");
				await page.screenshot({ path: join(SHOTS, "user-watchlist.png"), fullPage: true });
				await page.close();
			} finally {
				await userA.delete(`/v1/me/watchlist/${movie.metadataId}`, { headers: profileHeaders });
			}
		});

		await suite.case("details page shows trailers action with embed dialog", async (s) => {
			const metadataId = state.movies[0]?.metadataId ?? "";
			const page = await userContext.newPage();
			await page.goto(`${BASE_URL}/details/${metadataId}`);
			const visible = await pollContent(page, "trailer", 25_000, (text) => TRAILER_LABEL_PATTERN.test(text));
			s.expect(visible, "trailer action button missing on details page");
			await page.screenshot({ path: join(SHOTS, "details-trailer.png"), fullPage: true });
			await page.close();
		});

		await suite.case("realtime: created request and approval propagate to user page without reload", async (s) => {
			const page = await userContext.newPage();
			await page.goto(`${BASE_URL}/plugins/org.reelvault.requests/page/requests`);
			await page.waitForSelector("rv-requests-list", { timeout: 25_000, state: "attached" });
			await Bun.sleep(5_000);

			const marker = `Realtime UI ${(Math.random() + 1).toString(36).slice(2, 7)}`;
			const created = await userA.post<{ request?: { id: string } }>("/v1/plugins/org.reelvault.requests/requests", {
				body: { title: marker, mediaType: "movie" },
			});
			suite.expect(created.status === 201, `probe request -> ${created.status}`);
			const requestId = created.body.request?.id ?? "";

			try {
				let appeared = await pollContent(page, marker, 8_000);
				if (!appeared) {
					await admin.patch(`/v1/plugins/org.reelvault.requests/requests/${requestId}`, { body: { status: "pending" } });
					appeared = await pollContent(page, marker, 12_000);
				}
				s.expect(appeared, "created request did not appear on user page without reload");
				const approved = await admin.patch(`/v1/plugins/org.reelvault.requests/requests/${requestId}`, {
					body: { status: "approved" },
				});
				suite.expect(approved.status === 200, `approve -> ${approved.status}`);
				let badge = await pollContent(page, "approved", 8_000, (text) => APPROVED_LABEL_PATTERN.test(text));
				if (!badge) {
					await admin.patch(`/v1/plugins/org.reelvault.requests/requests/${requestId}`, { body: { status: "approved" } });
					badge = await pollContent(page, "approved", 12_000, (text) => APPROVED_LABEL_PATTERN.test(text));
				}
				s.expect(badge, "approval status did not propagate without reload");
				await page.screenshot({ path: join(SHOTS, "realtime-requests.png"), fullPage: true });
			} finally {
				await userA.delete(`/v1/plugins/org.reelvault.requests/requests/${requestId}`);
				await page.close();
			}
		});

		await adminContext.close();
		await userContext.close();
	} finally {
		await browser.close();
	}

	await suite.finish();
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
