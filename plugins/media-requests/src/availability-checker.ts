import type { MetadataAvailability, PluginHost } from "reelvault-sdk/plugin";
import type { MediaRequest, MediaRequestType } from "../types";
import type { RequestsManager } from "./requests-manager";

/** Statuses a request can sit in while still waiting for the library. */
const ACTIVE_STATUSES: ReadonlySet<MediaRequest["status"]> = new Set(["pending", "approved", "in_progress"]);

const WORD_CHAR = /[\p{L}\p{N}]/u;
const YEAR_PATTERN = /(?:19|20)\d{2}/g;

/** Provider namespace a request should be matched against, based on the ids it carries. */
function providerNamespace(request: MediaRequest): string | undefined {
	if (request.providerId) return request.providerId;
	if (request.tmdbId) return "tmdb";
	if (request.imdbId) return "imdb";
	return undefined;
}

/** Lowercase with separators collapsed to spaces — release names break words with `. _ -`. */
function normalizeForMatch(value: string): string {
	return value
		.toLowerCase()
		.replace(/[._\-[\]()]+/g, " ")
		.replace(/\s+/g, " ")
		.trim();
}

/** Whole-phrase containment bounded by non-word chars, so "alien" never matches "alien nation". */
function containsPhrase(haystack: string, needle: string): boolean {
	if (!needle) return false;
	let start = haystack.indexOf(needle);
	while (start !== -1) {
		const before = start === 0 ? "" : haystack[start - 1];
		const end = start + needle.length;
		const after = end >= haystack.length ? "" : haystack[end];
		if (!((before && WORD_CHAR.test(before)) || (after && WORD_CHAR.test(after)))) return true;
		start = haystack.indexOf(needle, start + 1);
	}
	return false;
}

/**
 * File-name match for id-less (legacy) requests: whole-phrase title containment,
 * guarded by the release year when both sides carry one.
 */
function fileMatchesRequest(request: MediaRequest, fileName: string): boolean {
	const title = normalizeForMatch(request.title);
	if (!title) return false;
	const name = normalizeForMatch(fileName);
	if (!containsPhrase(name, title)) return false;
	if (!request.year) return true;
	const years = name.match(YEAR_PATTERN);
	return !years || years.includes(String(request.year));
}

export class AvailabilityChecker {
	private readonly host: PluginHost;
	private readonly manager: RequestsManager;

	constructor(host: PluginHost, manager: RequestsManager) {
		this.host = host;
		this.manager = manager;
	}

	/**
	 * Checks newly scanned/identified metadata against all active requests.
	 */
	// No explicit return annotation: biome's noMisleadingReturnType misflags the
	// literal-zero early returns and demands a bogus `0 | 0 | 0` union.
	async checkMetadata(metadataId: string) {
		let fulfilledCount = 0;
		if (!metadataId) return fulfilledCount;

		const metadata = await this.host.metadata.get(metadataId);
		if (!metadata?.title) return fulfilledCount;

		const activeRequests = (await this.manager.getAllRequests()).filter((r) => ACTIVE_STATUSES.has(r.status));

		if (activeRequests.length === 0) return fulfilledCount;

		const metaTitleNormalized = metadata.title.trim().toLowerCase();
		const metaYear = metadata.releaseDate ? new Date(metadata.releaseDate).getFullYear() : undefined;
		const externalIds = new Map(metadata.externalIds.map((identity) => [identity.providerId, identity.externalId] as const));

		for (const req of activeRequests) {
			const reqTitleNormalized = req.title.trim().toLowerCase();
			const providerId = providerNamespace(req);
			const externalId = req.externalId ?? req.tmdbId ?? req.imdbId;
			let isMatch = false;

			// Match by provider external ids
			if (providerId && externalId && externalIds.get(providerId) === externalId) {
				isMatch = true;
			} else if (metaTitleNormalized === reqTitleNormalized) {
				// Direct title match
				if (!(req.year && metaYear) || req.year === metaYear) {
					isMatch = true;
				}
			}

			if (isMatch) {
				await this.manager.markAsAvailable(req, metadataId);
				fulfilledCount++;
			}
		}

		return fulfilledCount;
	}

	/**
	 * Synchronizes all active requests against the current library: exact
	 * external-id lookups first, then whole-phrase file-name matching for
	 * legacy requests that carry no provider ids.
	 */
	async syncAllRequests(): Promise<{ checked: number; fulfilled: number }> {
		const activeRequests = (await this.manager.getAllRequests()).filter((r) => ACTIVE_STATUSES.has(r.status));

		this.host.logger.info(`Starting synchronization of ${activeRequests.length} media requests`);
		let fulfilled = 0;

		const unresolved: MediaRequest[] = [];
		for (const request of activeRequests) {
			const providerId = providerNamespace(request);
			const externalId = request.externalId ?? request.tmdbId ?? request.imdbId;
			if (!(providerId && externalId)) {
				unresolved.push(request);
				continue;
			}
			const match = await this.findLibraryEntry(providerId, externalId, request.mediaType);
			if (match?.hasFiles && match.metadataId) {
				await this.manager.markAsAvailable(request, match.metadataId);
				fulfilled++;
			} else {
				unresolved.push(request);
			}
		}

		if (unresolved.length > 0) {
			const files = await this.host.media.listAllMediaFiles();
			for (const file of files) {
				if (unresolved.length === 0) break;
				const index = unresolved.findIndex((request) => fileMatchesRequest(request, file.fileName));
				if (index === -1) continue;
				const request = unresolved[index];
				if (!request) continue;
				await this.manager.markAsAvailable(request, file.mediaFileId);
				unresolved.splice(index, 1);
				fulfilled++;
			}
		}

		return {
			checked: activeRequests.length,
			fulfilled,
		};
	}

	private async findLibraryEntry(
		providerId: string,
		externalId: string,
		mediaType: MediaRequestType,
	): Promise<MetadataAvailability | null> {
		try {
			return await this.host.metadata.findByExternalId(providerId, externalId, mediaType);
		} catch (error) {
			this.host.logger.warn("Library lookup failed during request sync", { providerId, externalId, error });
			return null;
		}
	}
}
