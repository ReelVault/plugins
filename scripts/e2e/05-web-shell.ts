import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Suite } from "./lib/report";
import { BASE_URL, WEB_DIST } from "./lib/state";

/**
 * Web shell regressions: the server-injected API-origin marker, the SPA CSP
 * (including plugin-declared sources) and the service-worker navigation
 * strategy. These are the layers that produced "Network request failed" when a
 * precached shell pointed the client at the wrong API origin.
 */
const suite = new Suite("05-web-shell");

async function main(): Promise<void> {
	await suite.case("index.html carries the same-origin API marker and no-cache", async (s) => {
		const response = await fetch(`${BASE_URL}/index.html`);
		const html = await response.text();
		s.expect(response.status === 200, `GET /index.html -> ${response.status}`);
		s.expect(html.includes('name="reelvault-api-origin" content="same-origin"'), "API-origin meta missing from the entry HTML");
		s.expect((response.headers.get("content-type") ?? "").includes("text/html"), "entry Content-Type is not text/html");
		const cacheControl = response.headers.get("cache-control") ?? "";
		s.expect(cacheControl.includes("no-cache"), `entry Cache-Control: ${cacheControl}`);
	});

	await suite.case("SPA fallback routes carry the same-origin marker too", async (s) => {
		const response = await fetch(`${BASE_URL}/watchlist`);
		const html = await response.text();
		s.expect(response.status === 200, `GET /watchlist -> ${response.status}`);
		s.expect(html.includes('name="reelvault-api-origin" content="same-origin"'), "API-origin meta missing from the SPA fallback");
	});

	await suite.case("web UI CSP allows plugin-declared content sources only", async (s) => {
		const response = await fetch(`${BASE_URL}/`);
		const csp = response.headers.get("content-security-policy") ?? "";
		s.expect(csp.includes("default-src 'self'"), `unexpected CSP: ${csp.slice(0, 120)}`);
		s.expect(csp.includes("script-src 'self'"), "script-src must stay locked to self");
		s.expect(!csp.includes("'unsafe-eval'"), "unsafe-eval must never be allowed");
		s.expect(csp.includes("https://image.tmdb.org"), "TMDB artwork origin missing from img-src");
		s.expect(csp.includes("https://m.media-amazon.com"), "OMDb artwork origin missing from img-src");
		s.expect(csp.includes("https://www.youtube-nocookie.com"), "trailer frame-src missing");
	});

	await suite.case("service worker prefers the network for navigations", (s) => {
		const sw = readFileSync(join(WEB_DIST, "sw.js"), "utf8");
		s.expect(sw.includes("NetworkFirst"), "NetworkFirst navigation route missing from sw.js");
		s.expect(sw.includes("PrecacheFallbackPlugin"), "offline precache fallback missing from sw.js");
		s.expect(!sw.includes("NavigationRoute"), "precache-first NavigationRoute still present in sw.js");
	});

	await suite.finish();
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
