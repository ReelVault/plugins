export interface ApiResponse<T = unknown> {
	status: number;
	body: T;
	headers: Headers;
}

export interface RequestOptions {
	query?: Record<string, string | number | boolean | undefined>;
	body?: unknown;
	headers?: Record<string, string>;
	cookie?: string;
	form?: FormData;
}

export function extractData<T>(body: unknown): T[] {
	if (Array.isArray(body)) return body as T[];
	if (body && typeof body === "object" && Array.isArray((body as { data?: unknown }).data)) {
		return (body as { data: T[] }).data;
	}
	return [];
}

const DEFAULT_ORIGIN = "http://localhost:4660";

const OPTION_KEYS = ["query", "body", "headers", "cookie", "form"] as const;

function resolveOptions(method: string, arg: RequestOptions | object | undefined): RequestOptions {
	if (arg === undefined || arg === null) return {};
	if (OPTION_KEYS.some((key) => key in arg)) return arg;
	if (method === "GET") return { query: arg as RequestOptions["query"] };
	return { body: arg };
}

export class PluginApi {
	private readonly api: Api;
	private readonly pluginId: string;

	constructor(api: Api, pluginId: string) {
		this.api = api;
		this.pluginId = pluginId;
	}

	private path(sub: string): string {
		return `/v1/plugins/${this.pluginId}${sub}`;
	}

	get<T>(sub = "/", query?: Record<string, string | number | boolean | undefined>, cookie?: string): Promise<ApiResponse<T>> {
		return this.api.get<T>(this.path(sub), { query, cookie });
	}

	post<T>(sub = "/", body?: unknown, cookie?: string): Promise<ApiResponse<T>> {
		return this.api.post<T>(this.path(sub), { body, cookie });
	}

	patch<T>(sub: string, body?: unknown, cookie?: string): Promise<ApiResponse<T>> {
		return this.api.patch<T>(this.path(sub), { body, cookie });
	}

	delete<T>(sub = "/", cookie?: string): Promise<ApiResponse<T>> {
		return this.api.delete<T>(this.path(sub), { cookie });
	}
}

export class Api {
	private readonly cookie?: string;

	constructor(cookie?: string) {
		this.cookie = cookie;
	}

	withCookie(cookie: string): Api {
		return new Api(cookie);
	}

	async login(email: string, password: string, baseUrl = DEFAULT_ORIGIN): Promise<string> {
		let response = await this.req<{ retryAfterSeconds?: number }>("POST", "/v1/auth/login", {
			body: { email, password },
			headers: { origin: baseUrl },
		});
		if (response.status === 429) {
			const wait = (response.body.retryAfterSeconds ?? 30) + 2;
			console.log(`    [rate-limit] login ${email}: waiting ${wait}s`);
			await Bun.sleep(wait * 1_000);
			response = await this.req("POST", "/v1/auth/login", {
				body: { email, password },
				headers: { origin: baseUrl },
			});
		}
		if (response.status !== 200) {
			throw new Error(`login ${email} failed: ${response.status} ${JSON.stringify(response.body)}`);
		}
		const setCookie = response.headers.get("set-cookie");
		if (!setCookie) throw new Error(`login ${email}: no set-cookie header`);
		const value = setCookie.split(";")[0];
		if (!value) throw new Error(`login ${email}: empty cookie`);
		return value;
	}

	async req<T>(method: string, path: string, options: RequestOptions = {}): Promise<ApiResponse<T>> {
		const url = new URL(path, DEFAULT_ORIGIN);
		for (const [key, value] of Object.entries(options.query ?? {})) {
			if (value !== undefined) url.searchParams.set(key, String(value));
		}
		const headers: Record<string, string> = { ...options.headers };
		const cookie = options.cookie ?? this.cookie;
		if (cookie) headers.cookie = cookie;
		let body: string | FormData | undefined;
		if (options.form) {
			body = options.form;
		} else if (options.body !== undefined) {
			headers["content-type"] = "application/json";
			body = JSON.stringify(options.body);
		}
		const response = await fetch(url, { method, headers, body });
		const text = await response.text();
		let parsed: unknown = text;
		if (text.length > 0) {
			try {
				parsed = JSON.parse(text);
			} catch {
				parsed = text;
			}
		}
		return { status: response.status, body: parsed as T, headers: response.headers };
	}

	get<T>(path: string, arg?: RequestOptions | object): Promise<ApiResponse<T>> {
		return this.req<T>("GET", path, resolveOptions("GET", arg));
	}

	post<T>(path: string, arg?: RequestOptions | object): Promise<ApiResponse<T>> {
		return this.req<T>("POST", path, resolveOptions("POST", arg));
	}

	put<T>(path: string, arg?: RequestOptions | object): Promise<ApiResponse<T>> {
		return this.req<T>("PUT", path, resolveOptions("PUT", arg));
	}

	patch<T>(path: string, arg?: RequestOptions | object): Promise<ApiResponse<T>> {
		return this.req<T>("PATCH", path, resolveOptions("PATCH", arg));
	}

	delete<T>(path: string, arg?: RequestOptions | object): Promise<ApiResponse<T>> {
		return this.req<T>("DELETE", path, resolveOptions("DELETE", arg));
	}

	plugin(pluginId: string): PluginApi {
		return new PluginApi(this, pluginId);
	}
}

export async function expectWait<T>(
	fn: () => T | null | Promise<T | null>,
	label: string,
	timeoutMs = 30_000,
	intervalMs = 500,
): Promise<T> {
	const deadline = Date.now() + timeoutMs;
	let last: T | null = null;
	while (Date.now() < deadline) {
		last = await fn();
		if (last !== null) return last;
		await Bun.sleep(intervalMs);
	}
	throw new Error(`expectWait timeout (${label}) after ${timeoutMs}ms`);
}

export async function waitForHealth(baseUrl = DEFAULT_ORIGIN): Promise<boolean> {
	try {
		const response = await fetch(`${baseUrl}/v1/health`, { signal: AbortSignal.timeout(1500) });
		return response.ok;
	} catch {
		return false;
	}
}
