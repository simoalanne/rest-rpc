import {
	resolveBodyCodec,
	defaultBodyCodecs,
	normalizeMediaType,
	type SerializedBody,
	type BodyCodec,
} from "../codecs/index.ts";
import type { RouteDeclaration, RouteTree } from "../contract/contract.ts";
import { replacePathParams } from "../contract/path.ts";
import type { HttpMethod } from "../contract/routeDeclaration.ts";
import type {
	ClientRequestForDeclaration,
	RequestScalar,
} from "../contract/request.ts";

export type FetchOptions = Omit<RequestInit, "method" | "body" | "headers"> & {
	additionalHeaders?: Record<string, RequestScalar | undefined>;
	contentType?: string;
};

export type ApiClientFetchOptions = Omit<
	FetchOptions,
	"signal" | "contentType" | "additionalHeaders"
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

/** Transport headers added by the client outside the declared route input. */
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
 * call accepts. Pass the type of the client's `globalHeaders` as the second
 * argument to make headers that it always provides optional. Pass a route tree
 * to infer a matching tree of request types.
 *
 * @see {@link https://rest-rpc.vercel.app/docs/client/fetch-client#type-helpers}
 */
export type InferClientRequest<
	T extends RouteTree,
	TGlobalHeaders extends ClientHeaders = Record<never, string>,
> = T extends {
	readonly "~restrpc": infer TRoute extends RouteDeclaration;
}
	? ClientRequestValue<
			ClientRequestForDeclaration<TRoute, GlobalHeaderKeys<TGlobalHeaders>>
		>
	: {
			[K in keyof T]: T[K] extends RouteTree
				? InferClientRequest<T[K], TGlobalHeaders>
				: never;
		};

type DeclaredContentType<E> = E extends { method: "GET" }
	? never
	: E extends { request: { contentType: infer TContentType } }
		? TContentType
		: never;

// A content-type list must be narrowed to one entry per call.
type ContentTypeOption<E> = [DeclaredContentType<E>] extends [never]
	? { contentType?: never }
	: DeclaredContentType<E> extends readonly string[]
		? { contentType: DeclaredContentType<E>[number] }
		: { contentType?: never };

/** Fetch options accepted by a particular route call. */
export type FetchOptionsFor<E extends RouteDeclaration> = Omit<
	FetchOptions,
	"contentType"
> &
	ContentTypeOption<E>;

export type FetchArgs<
	E extends RouteDeclaration = RouteDeclaration,
	TGlobalHeaders extends ClientHeaders = Record<never, string>,
> =
	ClientRequestForDeclaration<
		E,
		GlobalHeaderKeys<TGlobalHeaders>
	> extends infer TRequest
		? [TRequest] extends [never]
			? [request?: undefined, options?: FetchOptionsFor<E>]
			: ContentTypeOption<E> extends { contentType: string }
				? [request: TRequest, options: FetchOptionsFor<E>]
				: [request: TRequest, options?: FetchOptionsFor<E>]
		: never;

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
	request?: { contentType?: string | readonly string[] };
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
) => {
	return replacePathParams(route.path, (key) =>
		encodeURIComponent(String(params?.[key])),
	);
};

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
	selectedContentType?: string,
) => {
	const { body, query, params, headers } = args ?? {};
	const url = `${baseUrl}${serializeParams(route, params)}${serializeQuery(query)}`;
	const contentType =
		typeof route.request?.contentType === "string"
			? route.request.contentType
			: selectedContentType;
	return {
		url,
		body,
		contentType: contentType,
		headers: stringifyHeaders(headers),
	};
};

export type ExecuteRequestOptions = {
	baseUrl: string;
	bodyCodecs?: readonly BodyCodec[];
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
	} = constructBaseRequest(
		options.baseUrl,
		route,
		requestArgs,
		fetchOptions?.contentType,
	);

	let serialized: SerializedBody | undefined;
	if (body !== undefined && contentType !== undefined) {
		const mediaType = normalizeMediaType(contentType);
		const resolvedCodec = resolveBodyCodec(mediaType, [
			...(options.bodyCodecs ?? []),
			...defaultBodyCodecs,
		]);
		if (!resolvedCodec?.serialize)
			throw new Error("No serializer for declared content-type");
		serialized = await resolvedCodec.serialize(body, contentType);
	}
	const codecHeaders = stringifyHeaders(serialized?.headers);
	const outgoingContentType =
		serialized && (serialized.contentType ?? contentType);
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
		const {
			contentType: _contentType,
			additionalHeaders: _additionalHeaders,
			...requestFetchOptions
		} = fetchOptions ?? {};
		const init: RequestInit = {
			...options.fetchOptions,
			...requestFetchOptions,
			method: route.method,
			body: serialized?.body as RequestInit["body"],
			headers: {
				...clientHeaders,
				...normalizeHeaders(requestHeaders),
				...normalizeHeaders(codecHeaders),
				...(outgoingContentType ? { "content-type": outgoingContentType } : {}),
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
