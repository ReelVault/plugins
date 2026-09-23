import type { PluginUiHost } from "reelvault-sdk/ui";
import type {
	ComingSoonResponse,
	DiscoverPage,
	GenreTile,
	MediaDetails,
	MediaGenre,
	MediaRequest,
	MediaRequestStatus,
	MediaSearchResults,
	MediaSeasonDetails,
	RequestsSummary,
} from "../../types";

export interface ProviderStatus {
	id: string;
	name: string;
	version: string;
	pluginId: string;
}

export interface RequestsResponse {
	requests: MediaRequest[];
	total: number;
}

export interface RequestMutationResponse {
	success: boolean;
	request: MediaRequest;
}

export interface CreateRequestPayload {
	title: string;
	mediaType: "movie" | "tv_show";
	year?: number;
	providerId?: string;
	externalId?: string;
	posterPath?: string;
	overview?: string;
	notes?: string;
	/** Display name of the requester; the plugin route context carries only ids. */
	requestedByName?: string;
}

export interface DiscoverQuery {
	category: string;
	mediaType: "movie" | "tv_show";
	page?: number;
	window?: "day" | "week";
	genreId?: string;
	year?: number;
	providerId?: string;
	externalId?: string;
}

export interface PluginApi {
	listProviders(): Promise<{ providers: ProviderStatus[] }>;
	discover(query: DiscoverQuery): Promise<DiscoverPage>;
	search(query: { query: string; mediaType: "movie" | "tv_show" }): Promise<MediaSearchResults>;
	genres(query: { mediaType: "movie" | "tv_show"; providerId?: string }): Promise<{ genres: MediaGenre[] }>;
	genreTiles(query: { mediaType: "movie" | "tv_show"; providerId?: string }): Promise<{ tiles: GenreTile[] }>;
	details(query: { providerId: string; externalId: string; mediaType: "movie" | "tv_show" }): Promise<MediaDetails>;
	season(query: { providerId: string; externalId: string; seasonNumber: number }): Promise<MediaSeasonDetails>;
	listRequests(query?: { scope?: string; status?: string; mediaType?: string }): Promise<RequestsResponse>;
	summary(): Promise<RequestsSummary>;
	comingSoon(): Promise<ComingSoonResponse>;
	createRequest(body: CreateRequestPayload): Promise<RequestMutationResponse>;
	updateRequest(id: string, body: { status: MediaRequestStatus; notes?: string }): Promise<RequestMutationResponse>;
	deleteRequest(id: string): Promise<{ success: boolean }>;
}

/** Drops empty values so optional query params never reach the wire as `undefined`. */
function compactQuery(query: Record<string, string | number | undefined>): Record<string, string> {
	const result: Record<string, string> = {};
	for (const [key, value] of Object.entries(query)) {
		if (value !== undefined && value !== "") result[key] = String(value);
	}
	return result;
}

export function createApi(host: PluginUiHost): PluginApi {
	const call = host.api.call.bind(host.api);

	return {
		listProviders: () => call<{ providers: ProviderStatus[] }>("/providers"),
		discover: (query) => call<DiscoverPage>("/discover", { query: compactQuery({ ...query }) }),
		search: (query) => call<MediaSearchResults>("/search", { query: compactQuery({ ...query }) }),
		genres: (query) => call<{ genres: MediaGenre[] }>("/genres", { query: compactQuery({ ...query }) }),
		genreTiles: (query) => call<{ tiles: GenreTile[] }>("/genre-tiles", { query: compactQuery({ ...query }) }),
		details: (query) => call<MediaDetails>("/details", { query: compactQuery({ ...query }) }),
		season: (query) => call<MediaSeasonDetails>("/seasons", { query: compactQuery({ ...query }) }),
		listRequests: (query) => call<RequestsResponse>("/requests", { query: compactQuery({ ...query }) }),
		summary: () => call<RequestsSummary>("/requests/summary"),
		comingSoon: () => call<ComingSoonResponse>("/coming-soon"),
		createRequest: (body) => call<RequestMutationResponse>("/requests", { method: "POST", body }),
		updateRequest: (id, body) => call<RequestMutationResponse>(`/requests/${encodeURIComponent(id)}`, { method: "PATCH", body }),
		deleteRequest: (id) => call<{ success: boolean }>(`/requests/${encodeURIComponent(id)}`, { method: "DELETE" }),
	};
}
