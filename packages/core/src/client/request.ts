import {
	isCustomBody,
	isFormBody,
	isMultipartBody,
	isNoBody,
} from "../contract/body.ts";
import type { RouteDeclaration } from "../contract/contract.ts";
import { replacePathParams } from "../contract/path.ts";
import { isJsonQuery } from "../contract/request.ts";
import type {
	FlatRequestInput,
	GroupedRequestInput,
} from "./groupRequestInput.ts";
import { groupRequestInput } from "./groupRequestInput.ts";
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
	if (isFormBody(request?.body)) return true;
	if (isMultipartBody(request?.body)) return true;
	if (isCustomBody(request?.body)) return true;
	return Boolean(request?.body && !isNoBody(request.body));
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
			'ApiClient getGlobalHeaders() must not return a "content-type" header. Use customBody({ schema, contentType }) on the route declaration instead.',
		);
	}
};

export const isJsonContentType = (contentType: string) =>
	contentType.split(";")[0]?.trim().toLowerCase() === "application/json";

export const serializeCustomBody = (body: unknown, contentType: string) =>
	isJsonContentType(contentType)
		? JSON.stringify(body)
		: (body as BodyInit | null | undefined);

const getDeclaredArrayKeys = (
	body: unknown,
	kind: "formBody" | "multipartBody",
) => {
	if (
		typeof body !== "object" ||
		body === null ||
		!("kind" in body) ||
		body.kind !== kind ||
		!("arrayKeys" in body) ||
		!Array.isArray(body.arrayKeys)
	) {
		return undefined;
	}

	return new Set(body.arrayKeys as string[]);
};

const serializeFormBody = (
	route: ClientRequestRoute,
	body: Record<string, unknown> | undefined,
) => {
	const routeBody = route.request?.body;
	const arrayKeys = getDeclaredArrayKeys(routeBody, "formBody");
	const formBody =
		route.request?.flattenKeys === false
			? body
			: ((body?.body as Record<string, unknown> | undefined) ?? body);

	return new URLSearchParams(
		Object.entries(formBody ?? {}).flatMap(([key, value]) => {
			if (Array.isArray(value)) {
				if (arrayKeys && !arrayKeys.has(key)) {
					throw new Error(
						`Invalid body key "${key}" for ${route.method} ${route.path}. Expected string, number, boolean, or an array for a declared form array key.`,
					);
				}

				return value.map((item) => [key, String(item)]);
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
	route: ClientRequestRoute,
	body: Record<string, unknown> | undefined,
) => {
	const routeBody = route.request?.body;
	const arrayKeys = getDeclaredArrayKeys(routeBody, "multipartBody");
	const multipartBody =
		route.request?.flattenKeys === false
			? body
			: ((body?.body as Record<string, unknown> | undefined) ?? body);
	const formData = new FormData();

	for (const [key, value] of Object.entries(multipartBody ?? {})) {
		if (Array.isArray(value)) {
			if (arrayKeys && !arrayKeys.has(key)) {
				throw new Error(
					`Invalid body key "${key}" for ${route.method} ${route.path}. Expected string, number, boolean, Blob, File, or an array for a declared multipart array key.`,
				);
			}

			for (const item of value) {
				formData.append(key, stringifyMultipartValue(item));
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
	const entries = Object.entries(query ?? {}).flatMap(([key, value]) => {
		const stringValue = isJsonQuery(route.request?.query)
			? stringifyJsonQueryValue(route, value)
			: value === undefined
				? undefined
				: String(value);
		return stringValue === undefined ? [] : [[key, stringValue]];
	});

	const search = new URLSearchParams(entries).toString();
	return search ? `?${search}` : "";
};

const stringifyJsonQueryValue = (route: ClientRequestRoute, value: unknown) => {
	if (value === undefined) return undefined;
	try {
		const json = JSON.stringify(value);
		if (json === undefined) return undefined;
		return json;
	} catch (error) {
		throw new Error(
			`Invalid JSON query for ${route.method} ${route.path}. Expected a JSON-serializable value.`,
			{ cause: error },
		);
	}
};

export const constructBaseRequest = (
	baseUrl: string,
	route: ClientRequestRoute,
	args: FlatRequestInput | undefined,
	strictRequestKeys: boolean,
): {
	url: string;
	body?: BodyInit | null;
	contentType?: string;
	headers?: Record<string, string>;
} => {
	let urlBase = `${baseUrl}${route.path}`;
	if (!args) return { url: urlBase };

	const request =
		route.request?.flattenKeys === false
			? (args as GroupedRequestInput)
			: groupRequestInput(route, args, { strictRequestKeys });
	const { body, query, params, headers } = request;
	const routeBody = route.request?.body;

	urlBase = `${baseUrl}${serializeParams(route, params)}${serializeQuery(route, query)}`;

	if (isFormBody(routeBody)) {
		return {
			url: urlBase,
			body: serializeFormBody(
				route,
				body as Record<string, unknown> | undefined,
			),
			headers: stringifyHeaders(route, headers),
		};
	}

	if (isMultipartBody(routeBody)) {
		return {
			url: urlBase,
			body: serializeMultipartBody(
				route,
				body as Record<string, unknown> | undefined,
			),
			headers: stringifyHeaders(route, headers),
		};
	}

	if (isCustomBody(routeBody)) {
		const bodyPayload = (body as Record<string, unknown> | undefined)?.body;
		const { contentType, payload } = Array.isArray(routeBody.contentType)
			? (bodyPayload as { contentType: string; payload: unknown })
			: {
					contentType: routeBody.contentType as string | undefined,
					payload: bodyPayload,
				};

		return {
			url: urlBase,
			body: contentType
				? serializeCustomBody(payload, contentType)
				: (payload as BodyInit | null | undefined),
			contentType,
			headers: stringifyHeaders(route, headers),
		};
	}

	return {
		url: urlBase,
		body: body ? JSON.stringify(body) : undefined,
		contentType: body ? "application/json" : undefined,
		headers: stringifyHeaders(route, headers),
	};
};

export const extractArgs = (route: ClientRequestRoute, args: unknown[]) => {
	const requestArgs = takesRequestInput(route)
		? (args[0] as FlatRequestInput)
		: undefined;
	const options = requestArgs ? args[1] : args[0];
	return { requestArgs, options } as {
		requestArgs?: FlatRequestInput;
		options?: FetchOptions;
	};
};

export type ExecuteRequestOptions = {
	baseUrl: string;
	fetch?: FetchLike;
	fetchOptions?: ApiClientFetchOptions;
	getGlobalHeaders?: GetHeadersFn;
	nextFetchTags?: NextFetchTagsOptions;
	timeoutMs?: number;
	strictRequestKeys: boolean;
};

const addNextFetchTags = (
	init: RequestInit,
	route: ClientRequestRoute,
	routeIdentity:
		| readonly string[]
		| Pick<ClientRequestRoute, "method" | "path">,
	request: FlatRequestInput | undefined,
	options: NextFetchTagsOptions | undefined,
	tagRequest: FlatRequestInput | undefined,
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
	tagRequest?: FlatRequestInput,
): Promise<Response> => {
	const { requestArgs, options: fetchOptions } = extractArgs(route, args);
	const {
		url,
		body,
		contentType,
		headers: requestHeaders,
	} = constructBaseRequest(
		options.baseUrl,
		route,
		requestArgs,
		options.strictRequestKeys,
	);

	const headers = (await options.getGlobalHeaders?.()) ?? {};
	assertNoContentTypeHeader(headers);
	const signalState = createRequestSignal(
		fetchOptions?.signal,
		options.timeoutMs,
	);

	try {
		const init = addNextFetchTags(
			{
				...options.fetchOptions,
				...fetchOptions,
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
