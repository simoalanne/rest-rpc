import {
	isSerializedBody,
	type BodyCodecRegistry,
	type BodyValue,
	type SerializedBody,
} from "../codecs/index.ts";
import type { RouteDefinition } from "../contract/routeDefinition.ts";
import { replacePathParams } from "../contract/path.ts";
import type { ClientTypeSource } from "./response.ts";
import type { HttpMethod } from "../contract/routeDefinition.ts";
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
 * The fetch-compatible function shape used by the core client.
 *
 * @see {@link https://rest-rpc.vercel.app/docs/client/fetch-client#custom-fetch}
 */
export type FetchLike = (
	input: string | URL | Request,
	init?: RequestInit,
) => Promise<Response>;

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

type ClientRequestValue<T> = [T] extends [never] ? undefined : T;

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
	? TArgs[0]
	: T extends { readonly "~restrpc": infer TRoute extends RouteDefinition }
		? ClientRequestValue<
				ClientRequestForDefinition<TRoute, GlobalHeaderKeys<TGlobalHeaders>>
			>
		: {
				[K in keyof T]: T[K] extends ClientTypeSource
					? InferClientRequest<T[K], TGlobalHeaders>
					: never;
			};

export type FetchArgs<
	E extends RouteDefinition = RouteDefinition,
	TGlobalHeaders extends ClientHeaders = Record<never, string>,
> =
	ClientRequestForDefinition<
		E,
		GlobalHeaderKeys<TGlobalHeaders>
	> extends infer TRequest
		? [TRequest] extends [never]
			? [request?: undefined, options?: FetchOptions]
			: [request: TRequest, options?: FetchOptions]
		: never;

type GroupedRequestInput = {
	contentType?: string;
	body?: unknown;
	query?: unknown;
	params?: Record<string, unknown>;
	headers?: Record<string, unknown>;
};

// Only the fields read while building a request, so tests can pass minimal routes.
type ClientRequestRoute = {
	method: HttpMethod;
	path: string;
	request?: { body?: Readonly<Record<string, unknown>> };
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
	baseUrl: string,
	route: ClientRequestRoute,
	args: GroupedRequestInput | undefined,
) => {
	const { contentType, body, query, params, headers } = args ?? {};
	const url = `${baseUrl}${serializeParams(route, params)}${serializeQuery(query)}`;
	return {
		url,
		body,
		// Calls select a media type when the route defines several.
		contentType: contentType ?? Object.keys(route.request?.body ?? {})[0],
		headers: stringifyHeaders(headers),
	};
};

// A plain body is sent with the selected content type, and a serialized body
// with its own headers.
const toRequestBody = (
	serialized: BodyValue | SerializedBody,
	contentType: string,
) =>
	isSerializedBody(serialized)
		? {
				body: serialized.body as RequestInit["body"],
				headers: Object.fromEntries(serialized.headers),
			}
		: {
				body: serialized as RequestInit["body"],
				headers: { "content-type": contentType },
			};

export type ExecuteRequestOptions = {
	baseUrl: string;
	codecs: BodyCodecRegistry;
	fetch?: FetchLike;
	fetchOptions?: ApiClientFetchOptions;
	globalHeaders?: ClientHeaders;
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
		contentType,
		headers: requestHeaders,
	} = constructBaseRequest(options.baseUrl, route, requestArgs);

	const serialized =
		body !== undefined && contentType !== undefined
			? toRequestBody(
					await options.codecs.serialize(body, contentType),
					contentType,
				)
			: undefined;
	const globalHeaders = await resolveHeaders(options.globalHeaders ?? {});
	const additionalHeaders = stringifyHeaders(fetchOptions?.additionalHeaders);
	const clientHeaders = {
		...normalizeHeaders(globalHeaders),
		...normalizeHeaders(additionalHeaders),
	};
	const signalState = createRequestSignal(
		fetchOptions?.signal,
		options.timeoutMs,
	);

	try {
		const { additionalHeaders: _additionalHeaders, ...requestFetchOptions } =
			fetchOptions ?? {};
		const init: RequestInit = {
			...options.fetchOptions,
			...requestFetchOptions,
			method: route.method,
			body: serialized?.body,
			headers: {
				...clientHeaders,
				...normalizeHeaders(requestHeaders),
				...serialized?.headers,
			},
			signal: signalState?.signal ?? fetchOptions?.signal,
		};
		const fetchImpl =
			options.fetch ?? ((input, init) => globalThis.fetch(input, init));
		return await fetchImpl(url, init);
	} finally {
		signalState?.cleanup();
	}
};
