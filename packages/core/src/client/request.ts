import {
	resolveBodyCodec,
	defaultBodyCodecs,
	normalizeMediaType,
	type SerializedBody,
	type BodyCodec,
} from "../codecs/index.ts";
import type { RouteDeclaration } from "../contract/contract.ts";
import { replacePathParams } from "../contract/path.ts";
import type { GroupedRequestInput } from "./requestInput.ts";
import { getNextFetchTags } from "./nextFetchTags.ts";
import type { ClientRequestRoute } from "./requestRoute.ts";
import type {
	ApiClientFetchOptions,
	FetchArgs,
	FetchLike,
	FetchOptions,
	ClientHeaders,
	NextFetchTagsOptions,
} from "./types.ts";

export const createRequestSignal = (
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

export const takesRequestInput = (route: ClientRequestRoute) => {
	const request = route.request;
	if (request?.query || request?.params || request?.headers) {
		return true;
	}
	if (request?.contentType !== undefined) return true;
	return Boolean(request?.body);
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
	_route: ClientRequestRoute,
	headers: Record<string, unknown> | undefined,
) =>
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

const serializeQuery = (route: ClientRequestRoute, query: unknown) => {
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
	const url = `${baseUrl}${serializeParams(route, params)}${serializeQuery(route, query)}`;
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
	const requestHeaders = stringifyHeaders(route, headers);
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
	nextFetchTags?: NextFetchTagsOptions;
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

const addNextFetchTags = (
	init: RequestInit,
	route: ClientRequestRoute,
	routeIdentity:
		| readonly string[]
		| Pick<ClientRequestRoute, "method" | "path">,
	request: GroupedRequestInput | undefined,
	options: NextFetchTagsOptions | undefined,
	tagRequest: GroupedRequestInput | undefined,
) => {
	if (!options?.enabled || route.method !== "GET") return init;

	const nextInit = init as RequestInit & {
		next?: {
			tags?: string[];
			[key: string]: unknown;
		};
	};

	return {
		...nextInit,
		next: {
			...nextInit.next,
			tags: [
				...(nextInit.next?.tags ?? []),
				...getNextFetchTags(route, routeIdentity, tagRequest ?? request, {
					tagPrefix: options.tagPrefix,
				}),
			],
		},
	};
};

export const executeRequest = async <E extends RouteDeclaration>(
	route: E | ClientRequestRoute,
	routeIdentity:
		| readonly string[]
		| Pick<ClientRequestRoute, "method" | "path">,
	args: FetchArgs<E> | unknown[],
	options: ExecuteRequestOptions,
	tagRequest?: GroupedRequestInput,
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
	const additionalHeaders = stringifyHeaders(
		route,
		fetchOptions?.additionalHeaders,
	);
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
		const init = addNextFetchTags(
			{
				...options.fetchOptions,
				...requestFetchOptions,
				method: route.method,
				body: serialized?.body as BodyInit | undefined,
				headers: {
					...clientHeaders,
					...normalizeHeaders(requestHeaders),
					...normalizeHeaders(codecHeaders),
					...(outgoingContentType
						? { "content-type": outgoingContentType }
						: {}),
				},
				signal: signalState?.signal ?? fetchOptions?.signal,
			},
			route,
			routeIdentity,
			requestArgs,
			options.nextFetchTags,
			tagRequest,
		);
		const fetchImpl =
			options.fetch ?? ((input, init) => globalThis.fetch(input, init));
		return await fetchImpl(url, init);
	} finally {
		signalState?.cleanup();
	}
};
