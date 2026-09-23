import { definePlugin, type ProviderDiscoveryCategory } from "reelvault-sdk/plugin";
import { config } from "./config";
import { AvailabilityService } from "./src/availability";
import { AvailabilityChecker } from "./src/availability-checker";
import { DiscoverService } from "./src/discover-service";
import { GenreTilesService } from "./src/genre-tiles";
import { ProviderAccess } from "./src/provider-access";
import { RequestsManager } from "./src/requests-manager";
import type { CreateMediaRequestInput, MediaRequestStatus, MediaRequestType } from "./types";

const DISCOVERY_CATEGORIES: ReadonlySet<string> = new Set([
	"trending",
	"popular",
	"upcoming",
	"top_rated",
	"now_playing",
	"recommendations",
	"similar",
]);

function parseMediaType(value: string | undefined): MediaRequestType {
	return value === "tv_show" ? "tv_show" : "movie";
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
	const parsed = Number(value);
	return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function parseOptionalPositiveInt(value: string | undefined): number | undefined {
	const parsed = Number(value);
	return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : undefined;
}

function isDiscoveryCategory(value: string | undefined): value is ProviderDiscoveryCategory {
	return value !== undefined && DISCOVERY_CATEGORIES.has(value);
}

function isRequestStatus(value: unknown): value is MediaRequestStatus {
	return value === "pending" || value === "approved" || value === "in_progress" || value === "available" || value === "rejected";
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonEmpty(value: string | undefined): string | undefined {
	return value === undefined || value === "" ? undefined : value;
}

function optionalString(record: Record<string, unknown>, key: string): string | undefined {
	const value = record[key];
	return typeof value === "string" && value !== "" ? value : undefined;
}

/** Validates an untyped HTTP body into a create-request payload. */
function parseCreateRequestInput(body: unknown): CreateMediaRequestInput | null {
	if (!isRecord(body)) return null;
	const title = typeof body.title === "string" ? body.title : "";
	const mediaType = body.mediaType === "movie" || body.mediaType === "tv_show" ? body.mediaType : undefined;
	if (!(title && mediaType)) return null;

	const year = typeof body.year === "number" && Number.isFinite(body.year) ? Math.floor(body.year) : undefined;
	const providerId = optionalString(body, "providerId");
	const externalId = optionalString(body, "externalId");
	const tmdbId = optionalString(body, "tmdbId");
	const imdbId = optionalString(body, "imdbId");
	const posterPath = optionalString(body, "posterPath");
	const overview = optionalString(body, "overview");
	const notes = optionalString(body, "notes");
	const requestedByName = optionalString(body, "requestedByName");

	return {
		title,
		mediaType,
		...(year !== undefined ? { year } : {}),
		...(providerId ? { providerId } : {}),
		...(externalId ? { externalId } : {}),
		...(tmdbId ? { tmdbId } : {}),
		...(imdbId ? { imdbId } : {}),
		...(posterPath ? { posterPath } : {}),
		...(overview ? { overview } : {}),
		...(notes ? { notes } : {}),
		...(requestedByName ? { requestedByName } : {}),
	};
}

export default definePlugin(config, {
	async setup(host) {
		const manager = new RequestsManager(host, host.config);
		const checker = new AvailabilityChecker(host, manager);
		const providerAccess = new ProviderAccess(host);
		const availability = new AvailabilityService(host, manager);
		const discoverService = new DiscoverService(providerAccess, availability);
		const genreTiles = new GenreTilesService(discoverService);

		const notifyChange = (payload: Record<string, unknown>): void => {
			try {
				host.realtime.broadcast("requests.changed", payload);
			} catch (error) {
				host.logger.warn("Failed to broadcast requests change", { error });
			}
		};

		host.logger.info("Media Requests plugin initialized", {
			autoApprove: host.config.autoApprove,
			notifyOnAvailable: host.config.notifyOnAvailable,
			maxActiveRequestsPerUser: host.config.maxActiveRequestsPerUser,
		});

		// 1. Scheduled task (Scheduled tasks)
		await host.tasks.register({
			id: "media-requests-sync",
			name: "media-requests-sync",
			description: "media-requests-sync",
			defaultTriggers: [{ id: "requests-sync-interval", type: "interval", intervalMinutes: 60 }],
			run: async () => {
				const result = await checker.syncAllRequests();
				host.logger.info("Media requests sync completed", result);
				return;
			},
		});

		// 2. HTTP route: GET /providers - available metadata providers
		await host.routes.register({
			method: "GET",
			path: "/providers",
			handler: async () => ({
				body: { providers: await providerAccess.list() },
			}),
		});

		// 3. HTTP route: GET /discover - trending / popular / upcoming, etc.
		await host.routes.register({
			method: "GET",
			path: "/discover",
			handler: async ({ query }) => {
				if (!isDiscoveryCategory(query.category)) {
					return { status: 400, body: { error: "Invalid discovery category." } };
				}

				const result = await discoverService.discover({
					type: parseMediaType(query.mediaType),
					category: query.category,
					page: parsePositiveInt(query.page, 1),
					window: query.window === "day" ? "day" : "week",
					genreId: nonEmpty(query.genreId),
					year: parseOptionalPositiveInt(query.year),
					providerId: nonEmpty(query.providerId),
				});

				return { body: result };
			},
		});

		// 4. HTTP route: GET /search - search movies and series
		await host.routes.register({
			method: "GET",
			path: "/search",
			handler: async ({ query }) => {
				const text = (query.query ?? query.q ?? "").trim();
				if (!text) return { body: { items: [] } };

				const result = await discoverService.search(parseMediaType(query.mediaType), text);
				return { body: result };
			},
		});

		// 5. HTTP route: GET /genres - genres available from the provider
		await host.routes.register({
			method: "GET",
			path: "/genres",
			handler: async ({ query }) => ({
				body: { genres: await discoverService.genres(parseMediaType(query.mediaType), nonEmpty(query.providerId)) },
			}),
		});

		// 6. HTTP route: GET /details - title details with availability
		await host.routes.register({
			method: "GET",
			path: "/details",
			handler: async ({ query }) => {
				const providerId = query.providerId;
				const externalId = query.externalId;
				if (!(providerId && externalId)) {
					return { status: 400, body: { error: "The 'providerId' and 'externalId' fields are required." } };
				}

				const details = await discoverService.details(providerId, parseMediaType(query.mediaType), externalId);
				if (!details) return { status: 404, body: { error: "Title details not found." } };
				return { body: details };
			},
		});

		// 6a. HTTP route: GET /seasons - a single season with its episodes
		await host.routes.register({
			method: "GET",
			path: "/seasons",
			handler: async ({ query }) => {
				const providerId = query.providerId;
				const externalId = query.externalId;
				if (!(providerId && externalId)) {
					return { status: 400, body: { error: "The 'providerId' and 'externalId' fields are required." } };
				}

				const season = await discoverService.seasonDetails(providerId, externalId, parsePositiveInt(query.seasonNumber, 1));
				if (!season) return { status: 404, body: { error: "Season not found." } };
				return { body: season };
			},
		});

		// 6b. HTTP route: GET /genre-tiles - genres with a sample backdrop (tiles)
		await host.routes.register({
			method: "GET",
			path: "/genre-tiles",
			handler: async ({ query }) => ({
				body: { tiles: await genreTiles.list(parseMediaType(query.mediaType), nonEmpty(query.providerId)) },
			}),
		});

		// 7. HTTP route: GET /requests - list requests
		await host.routes.register({
			method: "GET",
			path: "/requests",
			handler: async ({ query, user }) => {
				const status = isRequestStatus(query.status) ? query.status : undefined;
				const mediaType = query.mediaType === "movie" || query.mediaType === "tv_show" ? query.mediaType : undefined;
				const scope = query.scope === "all" ? "all" : "me";

				// If the user asked for their own only, or is not an admin
				const isUserScope = scope === "me" || user.role !== "admin";
				const userId = isUserScope ? user.id : undefined;

				const requests = await manager.listRequests({
					userId,
					status,
					mediaType,
				});

				return {
					body: {
						requests,
						total: requests.length,
					},
				};
			},
		});

		// 8. HTTP route: GET /requests/summary - summary statistics
		await host.routes.register({
			method: "GET",
			path: "/requests/summary",
			handler: async () => {
				const summary = await manager.getSummary();
				return {
					body: summary,
				};
			},
		});

		// 8a. HTTP route: GET /coming-soon - approved / in-progress requests for the dashboard section
		await host.routes.register({
			method: "GET",
			path: "/coming-soon",
			handler: async () => {
				if (!host.config.showDashboardSection) {
					return { body: { enabled: false, items: [] } };
				}
				const items = (await manager.listRequests({ statuses: ["approved", "in_progress"] }))
					.toSorted((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
					.slice(0, 20);
				return { body: { enabled: true, items } };
			},
		});

		// 9. HTTP route: POST /requests - submit a new request
		await host.routes.register({
			method: "POST",
			path: "/requests",
			handler: async ({ body, user }) => {
				const input = parseCreateRequestInput(body);
				if (!input) {
					return {
						body: { error: "The 'title' and 'mediaType' ('movie' | 'tv_show') fields are required." },
					};
				}

				try {
					const request = await manager.createRequest(input, {
						userId: user.id,
						profileId: user.profileId,
					});

					notifyChange({ action: "created", requestId: request.id });

					return {
						status: 201,
						body: {
							success: true,
							request,
						},
					};
				} catch (err: unknown) {
					return {
						body: { error: err instanceof Error ? err.message : "Failed to create the request." },
					};
				}
			},
		});

		// 10. HTTP Route: PATCH /requests/:id - Zmiana statusu (akceptacja / odrzucenie)
		await host.routes.register({
			method: "PATCH",
			path: "/requests/:id",
			access: "admin",
			handler: async ({ params, body }) => {
				const id = params.id;

				if (!id) {
					return { body: { error: "Missing request ID." } };
				}

				if (!(isRecord(body) && isRequestStatus(body.status))) {
					return { body: { error: "Invalid request status." } };
				}
				const notes = typeof body.notes === "string" ? body.notes : undefined;

				try {
					const updated = await manager.updateRequestStatus(id, body.status, notes);
					notifyChange({ action: "updated", requestId: id });
					return {
						body: {
							success: true,
							request: updated,
						},
					};
				} catch (err: unknown) {
					return {
						body: { error: err instanceof Error ? err.message : "Failed to update the request." },
					};
				}
			},
		});

		// 11. HTTP route: DELETE /requests/:id - cancel / delete a request
		await host.routes.register({
			method: "DELETE",
			path: "/requests/:id",
			handler: async ({ params, user }) => {
				const id = params.id;
				if (!id) {
					return { body: { error: "Missing request ID." } };
				}

				const isAdmin = user.role === "admin";
				const userId = user.id;

				try {
					await manager.deleteRequest(id, userId, isAdmin);
					notifyChange({ action: "deleted", requestId: id });
					return {
						body: {
							success: true,
							message: "The request was deleted.",
						},
					};
				} catch (err: unknown) {
					return {
						body: { error: err instanceof Error ? err.message : "Failed to delete the request." },
					};
				}
			},
		});

		// 12. Listen for a file being added / becoming ready in the library
		host.events.on("media.file.ready", async (event) => {
			host.logger.debug("Received media.file.ready event, checking requests match", {
				metadataId: event.metadataId,
			});

			try {
				const fulfilled = await checker.checkMetadata(event.metadataId);
				if (fulfilled > 0) {
					host.logger.info(`Fulfilled ${fulfilled} media requests via media.file.ready event`, {
						metadataId: event.metadataId,
					});
					notifyChange({ action: "available", metadataId: event.metadataId });
				}
			} catch (err) {
				host.logger.error("Error checking media requests on media.file.ready event", err);
			}
		});
	},
});
