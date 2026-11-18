import {
	isSerializedBody,
	type BodyCodecRegistry,
	type BodyValue,
	type SerializedBody,
} from "../codecs/index.ts";
import type { RouteDefinition } from "../contract/routeDefinition.ts";
import { joinPrefix, replacePathParams } from "../contract/path.ts";
import type { ClientTypeSource } from "./response.ts";
import type { AbsolutePath, HttpMethod } from "../contract/routeDefinition.ts";
import { intercept, type ClientInterceptor } from "./interceptor.ts";
import type {
	ClientRequestForDefinition,
	RequestScalar,
} from "../contract/request.ts";

/**
 * Fetch options accepted by a route call, plus headers added outside the
 * defined route input.
 *
 * @see {@link https://rest-rpc.vercel.app/docs/client/fetch-client#per-call-options}
 */
export type FetchOptions = Omit<RequestInit, "method" | "body" | "headers"> & {
	additionalHeaders?: Record<string, RequestScalar | undefined>;
};

export type ApiClientFetchOptions = Omit<
	FetchOptions,
	"signal" | "additionalHeaders"
>;

/**
 * The function the client sends each request with: `fetch`, or any function
 * that takes a Fetch `Request`, such as a Fetch app's `fetch`.
 *
 * @see {@link https://rest-rpc.vercel.app/docs/client/fetch-client#custom-fetch}
 */
export type FetchLike = (request: Request) => Promise<Response>;

/** A static client header or a provider evaluated for each request. */
export type ClientHeaderValue =
	| RequestScalar
	| undefined
	| (() => RequestScalar | undefined | Promise<RequestScalar | undefined>);

/** Transport headers added by the client outside the defined route input. */
export type ClientHeaders = Record<string, ClientHeaderValue>;

type LiteralKeys<T> = {
	[K in keyof T]: string extends K
		? never
		: number extends K
			? never
			: symbol extends K
				? never
				: K;
}[keyof T];

type ResolvedHeaderValue<T> = T extends (...args: never[]) => infer TResult
	? Awaited<TResult>
	: T;

type GlobalHeaderKeys<TGlobalHeaders extends ClientHeaders> = {
	[TKey in LiteralKeys<TGlobalHeaders>]: undefined extends ResolvedHeaderValue<
		TGlobalHeaders[TKey]
	>
		? never
		: TKey;
}[LiteralKeys<TGlobalHeaders>];

/**
 * Infers the request passed to a client route call.
 *
 * @remarks Routes without request input infer `undefined`, which the route
 * call accepts. Pass a client route function, such as
 * `typeof client.users.get`, whose headers that `globalHeaders` provides are
 * already optional. When passing a route instead, pass the type of the
 * client's `globalHeaders` as the second argument to make those headers
 * optional. Pass a client or route tree to infer a matching tree of request
 * types.
 *
 * @see {@link https://rest-rpc.vercel.app/docs/client/fetch-client#type-helpers}
 */
export type InferClientRequest<
	T extends ClientTypeSource,
	TGlobalHeaders extends ClientHeaders = Record<never, string>,
> = T extends (...args: infer TArgs) => Promise<unknown>
	? // An omittable request is optional in the call, which adds `undefined`.
		[Exclude<TArgs[0], undefined>] extends [never]
		? undefined
		: Exclude<TArgs[0], undefined>
	: T extends { readonly "~restrpc": infer TRoute extends RouteDefinition }
		? ClientRequestForDefinition<TRoute, GlobalHeaderKeys<TGlobalHeaders>>
		: {
				[K in keyof T]: T[K] extends ClientTypeSource
					? InferClientRequest<T[K], TGlobalHeaders>
					: never;
			};

// A request without required fields may be omitted, unless options are required.
export type RequestArgs<
	TRequest,
	TOptionsArgs extends readonly unknown[],
> = undefined extends TRequest
	? OmittableRequestArgs<TRequest, TOptionsArgs>
	: {} extends TRequest
		? OmittableRequestArgs<TRequest, TOptionsArgs>
		: [request: TRequest, ...TOptionsArgs];

type OmittableRequestArgs<
	TRequest,
	TOptionsArgs extends readonly unknown[],
> = TOptionsArgs extends readonly [unknown]
	? [request: TRequest | undefined, ...TOptionsArgs]
	: [request?: TRequest, ...TOptionsArgs];

export type FetchArgs<
	E extends RouteDefinition = RouteDefinition,
	TGlobalHeaders extends ClientHeaders = Record<never, string>,
> = RequestArgs<
	ClientRequestForDefinition<E, GlobalHeaderKeys<TGlobalHeaders>>,
	[options?: FetchOptions]
>;

type GroupedRequestInput = {
	body?: unknown;
	query?: unknown;
	params?: Record<string, unknown>;
	headers?: Record<string, unknown>;
};

// Only the fields read while building a request, so tests can pass minimal routes.
type ClientRequestRoute = {
	method: HttpMethod;
	path: string;
	request?: { body?: readonly unknown[] };
};

const createRequestSignal = (
	signal: RequestInit["signal"],
	timeoutMs: number | undefined,
) => {
	if (!timeoutMs) return null;

	const timeoutController = new AbortController();
	const timeoutId = setTimeout(() => timeoutController.abort(), timeoutMs);

	return {
		signal: signal
			? AbortSignal.any([signal, timeoutController.signal])
			: timeoutController.signal,
		cleanup: () => clearTimeout(timeoutId),
	};
};

const normalizeHeaders = (
	headers: Record<string, string> | undefined,
): Record<string, string> =>
	Object.fromEntries(
		Object.entries(headers ?? {}).map(([key, value]) => [
			key.toLowerCase(),
			value,
		]),
	);
const stringifyHeaders = (
	headers: Record<string, unknown> | undefined,
): Record<string, string> =>
	Object.fromEntries(
		Object.entries(headers ?? {}).flatMap(([key, value]) =>
			value === undefined ? [] : [[key, String(value)]],
		),
	);

const serializeParams = (
	route: ClientRequestRoute,
	params: Record<string, unknown> | undefined,
) =>
	replacePathParams(route.path, (key) => {
		const value = params?.[key];
		if (value === undefined) {
			throw new TypeError(
				`Missing path param "${key}" for route "${route.method} ${route.path}".`,
			);
		}
		return encodeURIComponent(String(value));
	});

const serializeQuery = (query: unknown) => {
	const searchParams = new URLSearchParams();
	for (const [key, value] of Object.entries(query ?? {})) {
		if (Array.isArray(value)) {
			for (const item of value) {
				searchParams.append(`${key}[]`, String(item));
			}
			continue;
		}

		if (value !== undefined) {
			searchParams.append(key, String(value));
		}
	}

	const search = searchParams.toString();
	return search ? `?${search}` : "";
};

export const constructBaseRequest = (
	origin: string | undefined,
	mountPath: AbsolutePath | undefined,
	route: ClientRequestRoute,
	args: GroupedRequestInput | undefined,
) => {
	const { body, query, params, headers } = args ?? {};
	// The mount path alone serves the `/` route, as on the server.
	const path = joinPrefix(
		mountPath,
		serializeParams(route, params) as AbsolutePath,
	);
	const url = `${origin ?? ""}${path}${serializeQuery(query)}`;
	const requestHeaders = normalizeHeaders(stringifyHeaders(headers));
	return {
		url,
		body: route.request?.body ? body : undefined,
		headers: requestHeaders,
	};
};

// A body is sent with the content type of its serialized headers, or else the
// one the headers state. Fetch sets the content type of `FormData` with its
// generated multipart boundary.
const toRequestBody = (
	serialized: BodyValue | SerializedBody,
	contentType: string | undefined,
) => {
	const { body, headers } = isSerializedBody(serialized)
		? serialized
		: { body: serialized, headers: undefined };
	const requestHeaders: Record<string, string> = { ...headers };
	requestHeaders["content-type"] ??= contentType ?? "application/json";
	if (body instanceof FormData) delete requestHeaders["content-type"];
	return { body: body as RequestInit["body"], headers: requestHeaders };
};

export type ExecuteRequestOptions = {
	origin?: string;
	/** Without a trailing slash. */
	mountPath?: AbsolutePath;
	codecs: BodyCodecRegistry;
	fetch?: FetchLike;
	fetchOptions?: ApiClientFetchOptions;
	globalHeaders?: ClientHeaders;
	interceptors?: readonly ClientInterceptor[];
	timeoutMs?: number;
};

const resolveHeaders = async (
	headers: ClientHeaders,
): Promise<Record<string, string>> => {
	const entries = await Promise.all(
		Object.entries(headers).map(async ([name, value]) => {
			const resolved = typeof value === "function" ? await value() : value;
			return resolved === undefined
				? undefined
				: ([name, String(resolved)] as const);
		}),
	);
	return Object.fromEntries(entries.filter((entry) => entry !== undefined));
};

// A stream body needs half duplex to be part of a `Request`. Only browsers
// resolve a URL without an origin, against the page.
const toRequest = (url: string, init: RequestInit, origin?: string) => {
	if (init.body instanceof ReadableStream) {
		(init as { duplex?: "half" }).duplex = "half";
	}
	try {
		return new Request(url, init);
	} catch (error) {
		if (origin !== undefined) throw error;
		throw new TypeError(
			"The client `origin` option is required outside browsers.",
			{ cause: error },
		);
	}
};

export const executeRequest = async (
	route: ClientRequestRoute,
	args: readonly unknown[],
	options: ExecuteRequestOptions,
): Promise<Response> => {
	const requestArgs = args[0] as GroupedRequestInput | undefined;
	const fetchOptions = args[1] as FetchOptions | undefined;
	const {
		url,
		body,
		headers: requestHeaders,
	} = constructBaseRequest(
		options.origin,
		options.mountPath,
		route,
		requestArgs,
	);

	const globalHeaders = await resolveHeaders(options.globalHeaders ?? {});
	const additionalHeaders = stringifyHeaders(fetchOptions?.additionalHeaders);
	// The call's headers override the client's, `content-type` included, so the
	// codec sees every header but those interceptors add.
	const outgoingHeaders: Record<string, string> = {
		...normalizeHeaders(globalHeaders),
		...normalizeHeaders(additionalHeaders),
		...requestHeaders,
	};
	const contentType = outgoingHeaders["content-type"];

	const serialized =
		body !== undefined
			? toRequestBody(
					await options.codecs.serialize(body, {
						...outgoingHeaders,
						// `FormData` is multipart, whatever the headers say.
						"content-type":
							body instanceof FormData
								? "multipart/form-data"
								: (contentType ?? "application/json"),
					}),
					contentType,
				)
			: undefined;
	const signalState = createRequestSignal(
		fetchOptions?.signal,
		options.timeoutMs,
	);

	try {
		const { additionalHeaders: _additionalHeaders, ...requestFetchOptions } =
			fetchOptions ?? {};
		const headers = outgoingHeaders;
		// A body's content type replaces the stated one, also when Fetch sets it
		// for `FormData`.
		if (serialized) {
			delete headers["content-type"];
			Object.assign(headers, serialized.headers);
		}
		const init: RequestInit = {
			...options.fetchOptions,
			...requestFetchOptions,
			method: route.method,
			body: serialized?.body,
			headers,
			signal: signalState?.signal ?? fetchOptions?.signal,
		};
		const send = options.fetch ?? ((request) => globalThis.fetch(request));
		const request = toRequest(url, init, options.origin);
		return await (options.interceptors?.length
			? intercept(options.interceptors, route as RouteDefinition, request, send)
			: send(request));
	} finally {
		signalState?.cleanup();
	}
};
