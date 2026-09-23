export interface TrailerInfo {
	metadataId: string;
	title: string;
	mediaType: "movie" | "tv_show";
	trailerKey: string;
	trailerUrl: string;
	site: "YouTube";
	name: string;
	official: boolean;
	language: string;
	cachedAt: string;
}

export interface TrailersStats {
	cachedCount: number;
	moviesCount: number;
	showsCount: number;
	lastSyncAt?: string;
}
