import type { PluginHost } from "@reelvault/sdk/plugin";
import type { MediaRequestsConfig } from "../config";
import type { CreateMediaRequestInput, MediaRequest, MediaRequestStatus, MediaRequestUser, RequestsSummary } from "../types";

const STORAGE_KEY_REQUESTS = "requests_list";

export class RequestsManager {
	private readonly host: PluginHost;
	private readonly config: MediaRequestsConfig;

	constructor(host: PluginHost, config: MediaRequestsConfig) {
		this.host = host;
		this.config = config;
	}

	async getAllRequests(): Promise<MediaRequest[]> {
		const stored = await this.host.storage.get(STORAGE_KEY_REQUESTS);
		return isMediaRequestArray(stored) ? stored : [];
	}

	async getRequestById(id: string): Promise<MediaRequest | null> {
		const all = await this.getAllRequests();
		return all.find((r) => r.id === id) ?? null;
	}

	async listRequests(filters?: {
		userId?: string;
		status?: MediaRequestStatus | "all";
		statuses?: MediaRequestStatus[];
		mediaType?: "movie" | "tv_show" | "all";
	}): Promise<MediaRequest[]> {
		let all = await this.getAllRequests();

		if (filters?.userId) {
			all = all.filter((r) => r.requestedBy.userId === filters.userId);
		}
		if (filters?.statuses) {
			const wanted = new Set(filters.statuses);
			all = all.filter((r) => wanted.has(r.status));
		} else if (filters?.status && filters.status !== "all") {
			all = all.filter((r) => r.status === filters.status);
		}
		if (filters?.mediaType && filters.mediaType !== "all") {
			all = all.filter((r) => r.mediaType === filters.mediaType);
		}

		// Sort newest first
		return all.toSorted((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
	}

	async createRequest(input: CreateMediaRequestInput, user: MediaRequestUser): Promise<MediaRequest> {
		const all = await this.getAllRequests();

		// Limit check for non-admin
		const userActiveCount = all.filter(
			(r) => r.requestedBy.userId === user.userId && (r.status === "pending" || r.status === "approved" || r.status === "in_progress"),
		).length;

		if (userActiveCount >= this.config.maxActiveRequestsPerUser) {
			throw new Error(`Active request limit reached (${this.config.maxActiveRequestsPerUser}). Wait for earlier requests to be fulfilled.`);
		}

		// Deduplication check by external id or title+year
		const existing = all.find(
			(r) =>
				(input.externalId != null && r.externalId === input.externalId) ||
				(input.tmdbId != null && r.tmdbId === input.tmdbId) ||
				(input.imdbId != null && r.imdbId === input.imdbId) ||
				(r.title.toLowerCase() === input.title.toLowerCase() && r.year === input.year && r.mediaType === input.mediaType),
		);

		if (existing) {
			if (existing.status === "available") {
				throw new Error(`"${input.title}" is already marked as available in the library.`);
			}
			throw new Error(`A request for this title already exists (status: ${existing.status}).`);
		}

		const now = new Date().toISOString();
		const newRequest: MediaRequest = {
			id: crypto.randomUUID(),
			title: input.title.trim(),
			mediaType: input.mediaType,
			year: input.year,
			tmdbId: input.tmdbId ?? (input.providerId === "tmdb" ? input.externalId : undefined),
			imdbId: input.imdbId,
			providerId: input.providerId,
			externalId: input.externalId,
			posterPath: input.posterPath,
			overview: input.overview,
			requestedBy: {
				userId: user.userId,
				profileId: user.profileId,
				userName: input.requestedByName ?? user.userName,
			},
			status: this.config.autoApprove ? "approved" : "pending",
			notes: input.notes,
			createdAt: now,
			updatedAt: now,
		};

		all.push(newRequest);
		await this.host.storage.set(STORAGE_KEY_REQUESTS, all);

		this.host.logger.info("New media request submitted", {
			id: newRequest.id,
			title: newRequest.title,
			status: newRequest.status,
			userId: user.userId,
		});

		return newRequest;
	}

	async updateRequestStatus(id: string, status: MediaRequestStatus, notes?: string): Promise<MediaRequest> {
		const all = await this.getAllRequests();
		const req = all.find((r) => r.id === id);
		if (!req) {
			throw new Error(`Request with ID ${id} not found.`);
		}

		const now = new Date().toISOString();
		req.status = status;
		req.updatedAt = now;
		if (notes !== undefined) req.notes = notes === "" ? undefined : notes;
		if (status === "available") {
			req.availableAt = now;
		} else {
			req.availableAt = undefined;
			req.matchedMetadataId = undefined;
		}

		await this.host.storage.set(STORAGE_KEY_REQUESTS, all);

		this.host.logger.info("Media request status updated", {
			id,
			title: req.title,
			newStatus: status,
		});

		return req;
	}

	async deleteRequest(id: string, requesterUserId?: string, isAdmin = false): Promise<void> {
		const all = await this.getAllRequests();
		const index = all.findIndex((r) => r.id === id);
		const req = all[index];
		if (!req) {
			throw new Error(`Request with ID ${id} not found.`);
		}
		if (!isAdmin && requesterUserId && req.requestedBy.userId !== requesterUserId) {
			throw new Error("You do not have permission to delete this request.");
		}

		all.splice(index, 1);
		await this.host.storage.set(STORAGE_KEY_REQUESTS, all);

		this.host.logger.info("Media request deleted", { id, title: req.title });
	}

	async markAsAvailable(request: MediaRequest, metadataId: string): Promise<void> {
		const all = await this.getAllRequests();
		const req = all.find((r) => r.id === request.id);
		if (!req) return;

		if (req.status === "available") return; // already marked

		const now = new Date().toISOString();
		req.status = "available";
		req.availableAt = now;
		req.updatedAt = now;
		req.matchedMetadataId = metadataId;

		await this.host.storage.set(STORAGE_KEY_REQUESTS, all);

		this.host.logger.info("Media request fulfilled and marked as available", {
			requestId: req.id,
			title: req.title,
			metadataId,
			userId: req.requestedBy.userId,
		});

		// send the notification
		if (this.config.notifyOnAvailable) {
			try {
				await this.host.notifications.create({
					userId: req.requestedBy.userId,
					profileId: req.requestedBy.profileId,
					type: "media.available",
					title: "Your requested title is now available!",
					message: `"${req.title}" was just added to your ReelVault library.`,
					data: {
						requestId: req.id,
						metadataId,
						title: req.title,
						mediaType: req.mediaType,
					},
					link: `/metadata/${metadataId}`,
				});
				this.host.logger.info("Notification sent to user for fulfilled request", {
					userId: req.requestedBy.userId,
					title: req.title,
				});
			} catch (err) {
				this.host.logger.error("Failed to send availability notification", err, {
					userId: req.requestedBy.userId,
					requestId: req.id,
				});
			}
		}
	}

	async getSummary(): Promise<RequestsSummary> {
		const all = await this.getAllRequests();
		return {
			total: all.length,
			pending: all.filter((r) => r.status === "pending").length,
			approved: all.filter((r) => r.status === "approved").length,
			inProgress: all.filter((r) => r.status === "in_progress").length,
			available: all.filter((r) => r.status === "available").length,
			rejected: all.filter((r) => r.status === "rejected").length,
		};
	}
}

function isMediaRequestArray(value: unknown): value is MediaRequest[] {
	return Array.isArray(value);
}
