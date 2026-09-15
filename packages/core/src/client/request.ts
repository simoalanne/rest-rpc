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
	GetHeadersFn,
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

const findHeader = (headers: Record<string, string>, name: string) =>
	Object.keys(headers).find((header) => header.toLowerCase() === name);

const hasHeader = (headers: Record<string, string>, name: string) =>
	findHeader(headers, name) !== undefined;

const normalizeHeaders = (headers: Record<string, string> | undefined) =>
	Object.fromEntries(
		Object.entries(headers ?? {}).map(([key, value]) => [
			key.toLowerCase(),
			value,
		]),
	);

export const assertNoContentTypeHeader = (headers: Record<string, string>) => {
	if (hasHeader(headers, "content-type")) {
		throw new Error(
			'ApiClient getGlobalHeaders() must not return a "content-type" header. Pass the content type to body(schema, { contentType }) on the route declaration instead.',
		);
	}
};

const normalizeContentType = (contentType: string) =>
	contentType.split(";")[0]?.trim().toLowerCase();

export const isJsonContentType = (contentType: string) =>
	normalizeContentType(contentType) === "application/json";

export const serializeCustomBody = (body: unknown, contentType: string) =>
	isJsonContentType(contentType)
		? JSON.stringify(body)
		: (body as BodyInit | null | undefined);

const serializeFormBody = (
	_route: ClientRequestRoute,
	body: Record<string, unknown> | undefined,
) => {
	return new URLSearchParams(
		Object.entries(body ?? {}).flatMap(([key, value]) => {
			if (Array.isArray(value)) {
				return value.map((item) => [`${key}[]`, String(item)]);
			}

			return value === undefined ? [] : [[key, String(value)]];
		}),
	);
};

const isMultipartFileValue = (value: unknown): value is Blob =>
	typeof Blob !== "undefined" && value instanceof Blob;

const stringifyMultipartValue = (value: unknown) => {
	if (isMultipartFileValue(value)) return value;
	return String(value);
};

const serializeMultipartBody = (
	_route: ClientRequestRoute,
	body: Record<string, unknown> | undefined,
) => {
	const formData = new FormData();

	for (const [key, value] of Object.entries(body ?? {})) {
		if (Array.isArray(value)) {
			for (const item of value) {
				formData.append(`${key}[]`, stringifyMultipartValue(item));
			}
			continue;
		}

		if (value !== undefined) {
			formData.append(key, stringifyMultipartValue(value));
		}
	}

	return formData;
};

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
	body?: BodyInit | null;
	contentType?: string;
	headers?: Record<string, string>;
} => {
	let urlBase = `${baseUrl}${route.path}`;
	if (!args) return { url: urlBase };

	const { body, query, params, headers } = args;

	urlBase = `${baseUrl}${serializeParams(route, params)}${serializeQuery(route, query)}`;

	if (route.request?.contentType !== undefined) {
		if (
			Array.isArray(route.request.contentType) &&
			selectedContentType === undefined
		) {
			throw new Error(
				`A contentType option is required for ${route.method} ${route.path}.`,
			);
		}
		const contentType =
			selectedContentType ??
			(Array.isArray(route.request.contentType)
				? undefined
				: (route.request.contentType as string));

		const normalizedContentType = contentType
			? normalizeContentType(contentType)
			: undefined;
		return {
			url: urlBase,
			body:
				normalizedContentType === "application/x-www-form-urlencoded"
					? serializeFormBody(
							route,
							body as Record<string, unknown> | undefined,
						)
					: normalizedContentType === "multipart/form-data"
						? serializeMultipartBody(
								route,
								body as Record<string, unknown> | undefined,
							)
						: contentType
							? serializeCustomBody(body, contentType)
							: (body as BodyInit | null | undefined),
			contentType:
				normalizedContentType === "multipart/form-data"
					? undefined
					: contentType,
			headers: stringifyHeaders(route, headers),
		};
	}

	return {
		url: urlBase,
		body: body !== undefined ? JSON.stringify(body) : undefined,
		contentType: body !== undefined ? "application/json" : undefined,
		headers: stringifyHeaders(route, headers),
	};
};

export type ExecuteRequestOptions = {
	baseUrl: string;
	fetch?: FetchLike;
	fetchOptions?: ApiClientFetchOptions;
	getGlobalHeaders?: GetHeadersFn;
	nextFetchTags?: NextFetchTagsOptions;
	timeoutMs?: number;
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

	const headers = (await options.getGlobalHeaders?.()) ?? {};
	assertNoContentTypeHeader(headers);
	const signalState = createRequestSignal(
		fetchOptions?.signal,
		options.timeoutMs,
	);

	try {
		const { contentType: _contentType, ...requestFetchOptions } =
			fetchOptions ?? {};
		const init = addNextFetchTags(
			{
				...options.fetchOptions,
				...requestFetchOptions,
				method: route.method,
				body,
				headers: {
					...normalizeHeaders(headers),
					...normalizeHeaders(requestHeaders),
					...(contentType ? { "content-type": contentType } : {}),
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
