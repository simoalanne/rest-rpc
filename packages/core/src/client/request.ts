import {
	resolveBodyCodec,
	defaultBodyCodecs,
	normalizeMediaType,
	type SerializedBody,
	type BodyCodec,
} from "../codecs/index.ts";
import type { RouteDeclaration } from "../contract/contract.ts";
import { replacePathParams } from "../contract/path.ts";
import type { HttpMethod } from "../contract/routeDeclaration.ts";
import type {
	ClientRequestForDeclaration,
	InferSchemaInputs,
	RequestScalar,
} from "../contract/request.ts";
import type { StandardSchemaV1 } from "../standard-schema/index.ts";

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
 * @see {@link https://rest-rpc.dev/docs/client/fetch-client#custom-fetch}
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

type RequiredKeys<T> = {
	[TKey in keyof T]-?: {} extends Pick<T, TKey> ? never : TKey;
}[keyof T];

type UnsatisfiedFlatHeaderKeys<
	E extends RouteDeclaration,
	TGlobalHeaders extends ClientHeaders,
> = E extends {
	input: "input";
	request: {
		headers: infer THeaders extends readonly StandardSchemaV1[];
	};
}
	? Exclude<
			RequiredKeys<InferSchemaInputs<THeaders>>,
			GlobalHeaderKeys<TGlobalHeaders>
		>
	: never;

type MissingGlobalHeaders<TKeys extends PropertyKey> = {
	readonly [
		TKey in Extract<
			TKeys,
			string
		> as `ERROR: required header "${TKey}" needs a guaranteed globalHeaders value`
	]: never;
};

type DeclaredContentType<E> = E extends {
	request: { contentType: infer TContentType };
}
	? TContentType
	: never;

/** Fetch options accepted by a particular route call. */
export type FetchOptionsFor<E extends RouteDeclaration> = Omit<
	FetchOptions,
	"contentType"
> &
	([DeclaredContentType<E>] extends [never]
		? { contentType?: never }
		: DeclaredContentType<E> extends readonly string[]
			? { contentType: DeclaredContentType<E>[number] }
			: { contentType?: never });

type RequiresFetchOptions<E> = [DeclaredContentType<E>] extends [never]
	? false
	: DeclaredContentType<E> extends readonly string[]
		? true
		: false;

type StandardFetchArgs<
	E extends RouteDeclaration,
	TGlobalHeaders extends ClientHeaders,
> =
	ClientRequestForDeclaration<E, GlobalHeaderKeys<TGlobalHeaders>> extends never
		? [request?: undefined, options?: FetchOptionsFor<E>]
		: RequiresFetchOptions<E> extends false
			? [
					request: ClientRequestForDeclaration<
						E,
						GlobalHeaderKeys<TGlobalHeaders>
					>,
					options?: FetchOptionsFor<E>,
				]
			: [
					request: ClientRequestForDeclaration<
						E,
						GlobalHeaderKeys<TGlobalHeaders>
					>,
					options: FetchOptionsFor<E>,
				];

export type FetchArgs<
	E extends RouteDeclaration = RouteDeclaration,
	TGlobalHeaders extends ClientHeaders = Record<never, string>,
> = [UnsatisfiedFlatHeaderKeys<E, TGlobalHeaders>] extends [never]
	? StandardFetchArgs<E, TGlobalHeaders>
	: [
			request: ClientRequestForDeclaration<E> &
				MissingGlobalHeaders<UnsatisfiedFlatHeaderKeys<E, TGlobalHeaders>>,
		];

type GroupedRequestInput = {
	body?: unknown;
	contentType?: string;
	query?: unknown;
	params?: Record<string, unknown>;
	headers?: Record<string, unknown>;
};

type ClientRequestDeclaration = {
	body?: unknown;
	contentType?: string | readonly string[];
	query?: unknown;
	params?: unknown;
	headers?: unknown;
};

type ClientRequestRoute = {
	method: HttpMethod;
	path: string;
	request?: ClientRequestDeclaration;
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
const stringifyHeaders = (headers: Record<string, unknown> | undefined) =>
	Object.fromEntries(
		Object.entries(headers ?? {}).flatMap(([key, value]) => {
			const stringValue = value === undefined ? undefined : String(value);
			return stringValue === undefined ? [] : [[key, stringValue]];
		}),
	);

const serializeParams = (
	route: ClientRequestRoute,
	params: Record<string, unknown> | undefined,
) => {
	return replacePathParams(route.path, (key) => {
		const value = params?.[key];
		if (value === undefined) {
			throw new Error(
				`Missing path param "${key}" for ${route.method} ${route.path}.`,
			);
		}
		return encodeURIComponent(String(value));
	});
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
): {
	url: string;
	body?: unknown;
	contentType?: string;
	headers?: Record<string, string>;
} => {
	const { body, query, params, headers } = args ?? {};
	const url = `${baseUrl}${serializeParams(route, params)}${serializeQuery(query)}`;
	const declaredContentType = route.request?.contentType;
	if (Array.isArray(declaredContentType) && selectedContentType === undefined) {
		throw new Error(
			`A contentType option is required for ${route.method} ${route.path}.`,
		);
	}
	if (
		selectedContentType !== undefined &&
		(!Array.isArray(declaredContentType) ||
			!declaredContentType.includes(selectedContentType))
	) {
		throw new Error(
			`Unsupported request contentType for ${route.method} ${route.path}.`,
		);
	}
	const contentType =
		selectedContentType ??
		(typeof declaredContentType === "string"
			? declaredContentType
			: undefined) ??
		(route.request?.body ? "application/json" : undefined);
	const requestHeaders = stringifyHeaders(headers);
	return {
		url,
		body: contentType === undefined ? undefined : body,
		contentType: body === undefined ? undefined : contentType,
		headers: requestHeaders,
	};
};

export type ExecuteRequestOptions = {
	baseUrl: string;
	bodyCodecs?: readonly BodyCodec<Response>[];
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

export const executeRequest = async <
	E extends RouteDeclaration & ClientRequestRoute,
>(
	route: E | ClientRequestRoute,
	args: FetchArgs<E> | unknown[],
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
	const codecHeaders = Object.fromEntries(
		Object.entries(serialized?.headers ?? {}).flatMap(([name, value]) =>
			value === undefined ? [] : [[name, String(value)]],
		),
	);
	const outgoingContentType =
		serialized?.contentType === undefined
			? contentType
			: serialized.contentType;
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
