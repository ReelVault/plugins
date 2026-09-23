export type MediaRequestStatus = "pending" | "approved" | "in_progress" | "available" | "rejected";

export type MediaRequestType = "movie" | "tv_show";

export interface MediaRequestUser {
	userId: string;
	profileId?: string;
	userName?: string;
}

export interface MediaRequest {
	id: string;
	title: string;
	mediaType: MediaRequestType;
	year?: number;
	tmdbId?: string;
	imdbId?: string;
	/** Provider namespace the external id belongs to (e.g. "tmdb"). */
	providerId?: string;
	/** Provider-native id for the requested title. */
	externalId?: string;
	posterPath?: string;
	overview?: string;
	requestedBy: MediaRequestUser;
	status: MediaRequestStatus;
	notes?: string;
	createdAt: string;
	updatedAt: string;
	availableAt?: string;
	matchedMetadataId?: string;
}

export interface CreateMediaRequestInput {
	title: string;
	mediaType: MediaRequestType;
	year?: number;
	tmdbId?: string;
	imdbId?: string;
	providerId?: string;
	externalId?: string;
	posterPath?: string;
	overview?: string;
	notes?: string;
	/** Display name of the requester (the route context carries only ids). */
	requestedByName?: string;
}

export interface UpdateMediaRequestStatusInput {
	status: MediaRequestStatus;
	notes?: string;
}

export interface RequestsSummary {
	total: number;
	pending: number;
	approved: number;
	inProgress: number;
	available: number;
	rejected: number;
}

/** Payload of the dashboard "coming soon" section: gated by plugin config. */
export interface ComingSoonResponse {
	enabled: boolean;
	items: MediaRequest[];
}

/** Request/library state of a discoverable title, surfaced as a UI badge. */
export type MediaAvailabilityState = "available" | "pending" | "approved" | "in_progress" | "rejected" | "none";

export interface MediaGenre {
	id: string;
	name: string;
}

export interface MediaCastMember {
	id: string;
	name: string;
	character?: string;
	profilePath?: string;
}

export interface MediaSeason {
	number: number;
	name: string;
	episodeCount: number;
	posterPath?: string;
	airDate?: string;
}

export interface MediaEpisode {
	number: number;
	name?: string;
	overview?: string;
	airDate?: string;
	thumbnailPath?: string;
}

/** A single season resolved from the provider, including its episode list. */
export interface MediaSeasonDetails {
	number: number;
	name?: string;
	overview?: string;
	airDate?: string;
	posterPath?: string;
	episodes: MediaEpisode[];
}

export interface MediaRating {
	source: string;
	label?: string;
	value: number;
	maxValue?: number;
}

export interface MediaCompany {
	id: string;
	name: string;
}

export interface MediaCrewMember {
	id: string;
	name: string;
	job: string;
	department?: string;
}

/** Discovery genre annotated with a representative backdrop for tile rendering. */
export interface GenreTile {
	id: string;
	name: string;
	mediaType: MediaRequestType;
	backdropPath?: string;
}

/** A poster card rendered by the plugin UI. */
export interface MediaCard {
	providerId: string;
	externalId: string;
	mediaType: MediaRequestType;
	title: string;
	year?: number;
	posterPath?: string;
	backdropPath?: string;
	/** Fully-resolved poster URL for hosts that cannot expand provider-native paths (e.g. the global search). */
	imageUrl?: string;
	overview?: string;
	voteAverage?: number;
	popularity?: number;
	state: MediaAvailabilityState;
	requestId?: string;
	metadataId?: string;
}

export interface DiscoverPage {
	providerId?: string;
	page: number;
	totalPages: number;
	totalResults: number;
	items: MediaCard[];
	/** True when no installed provider exposes the requested discovery category. */
	unsupported: boolean;
}

export interface MediaSearchResults {
	items: MediaCard[];
}

export interface MediaDetails extends MediaCard {
	backdropPath?: string;
	tagline?: string;
	releaseDate?: string;
	providerStatus?: string;
	originalTitle?: string;
	voteCount?: number;
	genres: MediaGenre[];
	cast: MediaCastMember[];
	crew: MediaCrewMember[];
	seasons: MediaSeason[];
	productionCompanies: MediaCompany[];
	keywords: MediaGenre[];
	ratings: MediaRating[];
}
