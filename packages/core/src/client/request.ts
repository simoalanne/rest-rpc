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
} from "../contract/validate.ts";
import { groupRequestInput } from "../contract/validate.ts";
import { getNextFetchTags } from "./nextFetchTags.ts";
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

export const takesRequestInput = (route: RouteDeclaration) => {
	if (route.query || route.pathParams || route.headers) {
		return true;
	}
	if (isFormBody(route.body)) return true;
	if (isMultipartBody(route.body)) return true;
	if (isCustomBody(route.body)) return true;
	return Boolean(route.body && !isNoBody(route.body));
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

const isSerializablePrimitive = (value: unknown) =>
	typeof value === "string" ||
	typeof value === "boolean" ||
	(typeof value === "number" && Number.isFinite(value));

const stringifyRequestValue = (
	route: RouteDeclaration,
	segment: "body" | "pathParams" | "query" | "headers",
	key: string,
	value: unknown,
	optional = false,
) => {
	if (value === undefined && optional) return undefined;
	if (isSerializablePrimitive(value)) return String(value);

	throw new Error(
		`Invalid ${segment} key "${key}" for ${route.method} ${route.path}. Expected string, number, or boolean.`,
	);
};

const serializeFormBody = (
	route: RouteDeclaration,
	body: Record<string, unknown> | undefined,
) => {
	const arrayKeys = new Set(isFormBody(route.body) ? route.body.arrayKeys : []);

	return new URLSearchParams(
		Object.entries(body ?? {}).flatMap(([key, value]) => {
			if (Array.isArray(value)) {
				if (!arrayKeys.has(key)) {
					throw new Error(
						`Invalid body key "${key}" for ${route.method} ${route.path}. Expected string, number, boolean, or an array for a declared form array key.`,
					);
				}

				return value.map((item) => {
					const stringValue = stringifyRequestValue(route, "body", key, item);
					if (stringValue === undefined) {
						throw new Error(
							`Invalid body key "${key}" for ${route.method} ${route.path}. Expected string, number, boolean, or an array for a declared form array key.`,
						);
					}
					return [key, stringValue];
				});
			}

			const stringValue = stringifyRequestValue(
				route,
				"body",
				key,
				value,
				true,
			);
			return stringValue === undefined ? [] : [[key, stringValue]];
		}),
	);
};

const isMultipartFileValue = (value: unknown): value is Blob =>
	typeof Blob !== "undefined" && value instanceof Blob;

const stringifyMultipartValue = (
	route: RouteDeclaration,
	key: string,
	value: unknown,
	optional = false,
) => {
	if (value === undefined && optional) return undefined;
	if (isMultipartFileValue(value)) return value;
	if (isSerializablePrimitive(value)) return String(value);

	throw new Error(
		`Invalid body key "${key}" for ${route.method} ${route.path}. Expected string, number, boolean, Blob, File, or an array for a declared multipart array key.`,
	);
};

const serializeMultipartBody = (
	route: RouteDeclaration,
	body: Record<string, unknown> | undefined,
) => {
	const arrayKeys = new Set(
		isMultipartBody(route.body) ? route.body.arrayKeys : [],
	);
	const formData = new FormData();

	for (const [key, value] of Object.entries(body ?? {})) {
		if (Array.isArray(value)) {
			if (!arrayKeys.has(key)) {
				throw new Error(
					`Invalid body key "${key}" for ${route.method} ${route.path}. Expected string, number, boolean, Blob, File, or an array for a declared multipart array key.`,
				);
			}

			for (const item of value) {
				const formValue = stringifyMultipartValue(route, key, item);
				if (formValue === undefined) {
					throw new Error(
						`Invalid body key "${key}" for ${route.method} ${route.path}. Expected string, number, boolean, Blob, File, or an array for a declared multipart array key.`,
					);
				}
				formData.append(key, formValue);
			}
			continue;
		}

		const formValue = stringifyMultipartValue(route, key, value, true);
		if (formValue !== undefined) formData.append(key, formValue);
	}

	return formData;
};

const stringifyHeaders = (
	route: RouteDeclaration,
	headers: Record<string, unknown> | undefined,
) =>
	Object.fromEntries(
		Object.entries(headers ?? {}).flatMap(([key, value]) => {
			const stringValue = stringifyRequestValue(
				route,
				"headers",
				key,
				value,
				true,
			);
			return stringValue === undefined ? [] : [[key, stringValue]];
		}),
	);

const serializeParams = (
	route: RouteDeclaration,
	pathParams: Record<string, unknown> | undefined,
) => {
	return replacePathParams(route.path, (key) => {
		const value = stringifyRequestValue(
			route,
			"pathParams",
			key,
			pathParams?.[key],
		);
		if (value === undefined) {
			throw new Error(
				`Invalid pathParams key "${key}" for ${route.method} ${route.path}. Expected string, number, or boolean.`,
			);
		}
		return encodeURIComponent(value);
	});
};

const serializeQuery = (route: RouteDeclaration, query: unknown) => {
	if (isJsonQuery(route.query)) {
		if (query === undefined) return "";
		let encoded: string;
		try {
			const json = JSON.stringify(query);
			if (json === undefined) return "";
			encoded = json;
		} catch (error) {
			throw new Error(
				`Invalid JSON query for ${route.method} ${route.path}. Expected a JSON-serializable value.`,
				{ cause: error },
			);
		}
		return `?${new URLSearchParams([["query", encoded]]).toString()}`;
	}

	const entries = Object.entries(query ?? {}).flatMap(([key, value]) => {
		const stringValue = stringifyRequestValue(route, "query", key, value, true);
		return stringValue === undefined ? [] : [[key, stringValue]];
	});

	const search = new URLSearchParams(entries).toString();
	return search ? `?${search}` : "";
};

export const constructBaseRequest = (
	baseUrl: string,
	route: RouteDeclaration,
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
		route.flattenRequestKeys === false
			? (args as GroupedRequestInput)
			: groupRequestInput(route, args, { strictRequestKeys });
	const { body, query, pathParams, headers } = request;

	urlBase = `${baseUrl}${serializeParams(route, pathParams)}${serializeQuery(route, query)}`;

	if (isFormBody(route.body)) {
		return {
			url: urlBase,
			body: serializeFormBody(
				route,
				body as Record<string, unknown> | undefined,
			),
			headers: stringifyHeaders(route, headers),
		};
	}

	if (isMultipartBody(route.body)) {
		return {
			url: urlBase,
			body: serializeMultipartBody(
				route,
				body as Record<string, unknown> | undefined,
			),
			headers: stringifyHeaders(route, headers),
		};
	}

	if (isCustomBody(route.body)) {
		const { contentType, payload } = Array.isArray(route.body.contentType)
			? (body as { contentType: string; payload: unknown })
			: {
					contentType: route.body.contentType as string | undefined,
					payload: body,
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

export const extractArgs = (route: RouteDeclaration, args: unknown[]) => {
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
	route: RouteDeclaration,
	request: FlatRequestInput | undefined,
	options: NextFetchTagsOptions | undefined,
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
				...getNextFetchTags(route, request, {
					tagPrefix: options.tagPrefix,
				}),
			],
		},
	};
};

export const executeRequest = async <E extends RouteDeclaration>(
	route: E,
	args: FetchArgs<E>,
	options: ExecuteRequestOptions,
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
			requestArgs,
			options.nextFetchTags,
		);
		const fetchImpl =
			options.fetch ?? ((input, init) => globalThis.fetch(input, init));
		return await fetchImpl(url, init);
	} finally {
		signalState?.cleanup();
	}
};
