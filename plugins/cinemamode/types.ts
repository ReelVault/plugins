/** One pre-play entry the player renders before the actual title starts. */
export interface PreRollEntry {
	kind: "youtube";
	/** YouTube video key (embedded via youtube-nocookie). */
	key: string;
	/** Title of the movie/show the trailer belongs to. */
	title: string;
	/** Trailer's own name (e.g. "Official Trailer"). */
	trailerName?: string | undefined;
	/** Backdrop/poster of the related title for the "up next" card. */
	imageUrl?: string | undefined;
	/** Library metadata id when the title is owned (undefined for provider-only picks). */
	metadataId?: string | undefined;
}

export interface PreRollResponse {
	entries: PreRollEntry[];
}

export interface PreRollCacheEntry {
	cachedAt: string;
	entries: PreRollEntry[];
}
