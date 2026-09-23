const TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p";
const ABSOLUTE_URL = /^https?:\/\//i;
const TMDB_ORIGINAL_SEGMENT = "/t/p/original/";

/**
 * Provider-relative paths (`/abc.jpg`, TMDB convention) are expanded to the
 * image CDN at the requested size; absolute URLs pass through untouched —
 * except TMDB `original` URLs, which are downscaled to the requested size
 * so shelves and tiles never pull full-resolution artwork.
 */
export function imageUrl(path: string | undefined | null, size = "w500"): string | undefined {
	if (!path) return undefined;
	if (ABSOLUTE_URL.test(path)) return path.includes(TMDB_ORIGINAL_SEGMENT) ? path.replace(TMDB_ORIGINAL_SEGMENT, `/t/p/${size}/`) : path;
	if (path.startsWith("/")) return `${TMDB_IMAGE_BASE}/${size}${path}`;
	return path;
}

export const posterUrl = (path?: string): string | undefined => imageUrl(path, "w342");

export const widePosterUrl = (path?: string): string | undefined => imageUrl(path, "w500");

export const backdropUrl = (path?: string): string | undefined => imageUrl(path, "w1280");

export const tileBackdropUrl = (path?: string): string | undefined => imageUrl(path, "w780");

export const profileUrl = (path?: string): string | undefined => imageUrl(path, "w185");

export const stillUrl = (path?: string): string | undefined => imageUrl(path, "w300");
