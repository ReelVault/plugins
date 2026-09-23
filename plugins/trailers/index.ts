import { definePlugin, ok, route, t } from "@reelvault/sdk/plugin";
import { config } from "./config";
import { TrailersManager } from "./src/trailers-manager";

interface BulkCacheItem {
	id: string;
	title?: string;
	type?: "movie" | "tv_show";
	tmdbId?: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseBulkCacheItems(body: unknown): BulkCacheItem[] | undefined {
	if (!Array.isArray(body)) return undefined;

	const items: BulkCacheItem[] = [];
	for (const entry of body) {
		if (!isRecord(entry) || typeof entry.id !== "string") continue;
		items.push({
			id: entry.id,
			...(typeof entry.title === "string" ? { title: entry.title } : {}),
			...(entry.type === "movie" || entry.type === "tv_show" ? { type: entry.type } : {}),
			...(typeof entry.tmdbId === "number" ? { tmdbId: entry.tmdbId } : {}),
		});
	}
	return items;
}

const TrailerQuery = t.Object({
	metadataId: t.Optional(t.String()),
	title: t.Optional(t.String()),
	mediaType: t.Optional(t.Union([t.Literal("movie"), t.Literal("tv_show")])),
	tmdbId: t.Optional(t.String()),
	year: t.Optional(t.String()),
});

export default definePlugin(config, {
	async setup(host) {
		const manager = new TrailersManager(host, host.config);

		host.logger.info("Trailers plugin initialized", {
			preferredLanguage: host.config.preferredLanguage,
		});

		// 1. HTTP route: GET /trailer - fetch a trailer for a specific title
		await host.routes.register(
			route({
				method: "GET",
				path: "/trailer",
				query: TrailerQuery,
				handler: async ({ query }) => {
					const metadataId = query.metadataId ?? "";
					const mediaType = query.mediaType ?? "movie";
					const tmdbId = query.tmdbId !== undefined ? Number(query.tmdbId) : undefined;
					const year = query.year !== undefined ? Number(query.year) : undefined;

					if (!(metadataId || query.title || tmdbId)) {
						return ok({ error: "metadataId, title or tmdbId is required." });
					}

					const trailer = await manager.getTrailer(metadataId, {
						tmdbId,
						title: query.title,
						mediaType,
						year,
					});

					if (!trailer) {
						return ok({ found: false, message: "No trailer found for this title." });
					}

					// Flattened so the schema can read `data.trailer.trailerKey` (the
					// response is stored verbatim under the schema's `trailer` source).
					return ok({ found: true, ...trailer });
				},
			}),
		);

		// 2. HTTP route: GET /stats - trailer statistics
		await host.routes.register({
			method: "GET",
			path: "/stats",
			handler: async () => {
				const stats = await manager.getStats();
				return ok({
					...stats,
					config: { preferredLanguage: host.config.preferredLanguage },
				});
			},
		});

		// 3. HTTP route: POST /cache-all - bulk trailer fetch
		await host.routes.register({
			method: "POST",
			path: "/cache-all",
			access: "admin",
			handler: async ({ body }) => {
				const items = parseBulkCacheItems(body);
				const result = await manager.bulkCache(items);
				return ok({ success: true, ...result });
			},
		});
	},
});
