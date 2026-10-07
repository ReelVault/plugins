import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

export const E2E_ROOT = "/tmp/rv-plugins-e2e";
export const DATA_DIR = join(E2E_ROOT, "data");
export const MEDIA_DIR = join(E2E_ROOT, "media");
export const STAGING_DIR = join(MEDIA_DIR, "_staging");
export const MOVIES_DIR = join(MEDIA_DIR, "Movies");
export const SERIES_DIR = join(MEDIA_DIR, "Series");
export const REPORTS_DIR = join(E2E_ROOT, "reports");
export const SERVER_LOG = join(E2E_ROOT, "server.log");
export const STATE_PATH = join(E2E_ROOT, "state.json");
export const KEYS_PATH = join(E2E_ROOT, "keys.json");

export const PORT = 4660;
export const BASE_URL = `http://localhost:${PORT}`;

/** ReelVault workspace root — the directory containing plugins/, reelvault/ and website/. */
const WORKSPACE_ROOT = resolve(import.meta.dir, "..", "..", "..", "..");

/** Sibling checkouts; point the env overrides elsewhere when they do not live next to plugins/. */
export const SERVER_DIR = process.env.E2E_SERVER_DIR ?? join(WORKSPACE_ROOT, "reelvault");
export const WEB_DIST = process.env.E2E_WEB_DIST ?? join(WORKSPACE_ROOT, "website", "dist");
export const PLUGINS_DIST = join(import.meta.dir, "..", "..", "..", "dist", "plugins");

export const PLUGIN_ZIPS = [
	"org.reelvault.tmdb",
	"org.reelvault.omdb",
	"org.reelvault.requests",
	"org.reelvault.cinemamode",
	"org.reelvault.community-markers",
	"org.reelvault.trailers",
	"org.reelvault.webhooks",
	"org.reelvault.bug-reports",
] as const;

export type PluginId = (typeof PLUGIN_ZIPS)[number];

export const ADMIN_ACCOUNT = {
	email: "admin-e2e@reelvault.local",
	password: "E2eAdmin#4660x",
	name: "E2E Admin",
};

export const USER_A = {
	email: "user-a-e2e@reelvault.local",
	password: "E2eUserA#4660x",
	username: "e2e_user_a",
};

export const USER_B = {
	email: "user-b-e2e@reelvault.local",
	password: "E2eUserB#4660x",
	username: "e2e_user_b",
};

export interface E2eKeys {
	tmdbApiKey?: string;
	omdbApiKey?: string;
}

export function loadKeys(): E2eKeys {
	const keys: E2eKeys = {
		tmdbApiKey: process.env.E2E_TMDB_KEY,
		omdbApiKey: process.env.E2E_OMDB_KEY,
	};
	if (existsSync(KEYS_PATH)) {
		const stored = JSON.parse(readFileSync(KEYS_PATH, "utf8")) as Partial<E2eKeys>;
		keys.tmdbApiKey ??= stored.tmdbApiKey;
		keys.omdbApiKey ??= stored.omdbApiKey;
	}
	return keys;
}

export function saveKeys(keys: E2eKeys): void {
	writeFileSync(KEYS_PATH, `${JSON.stringify(keys, null, "\t")}\n`, { mode: 0o600 });
}

export interface MovieInfo {
	title: string;
	metadataId: string;
	mediaFileId: string;
	libraryId: string;
}

export interface E2eState {
	adminCookie: string;
	userACookie: string;
	userBCookie: string;
	adminProfileId: string;
	userAProfileId: string;
	userBProfileId: string;
	moviesLibraryId: string;
	seriesLibraryId: string;
	movies: MovieInfo[];
	seriesEpisode: { metadataId: string; mediaFileId: string; seasonId?: string } | null;
	installedPlugins: string[];
}

export function readState(): E2eState | null {
	if (!existsSync(STATE_PATH)) return null;
	return JSON.parse(readFileSync(STATE_PATH, "utf8")) as E2eState;
}

export function writeState(state: E2eState): void {
	writeFileSync(STATE_PATH, `${JSON.stringify(state, null, "\t")}\n`);
}

export function ensureDirs(): void {
	for (const dir of [E2E_ROOT, DATA_DIR, MEDIA_DIR, STAGING_DIR, MOVIES_DIR, SERIES_DIR, REPORTS_DIR]) {
		mkdirSync(dir, { recursive: true });
	}
}
