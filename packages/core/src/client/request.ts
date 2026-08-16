import type { RouteDeclaration } from "../contract/contract.ts";
import { replacePathParams } from "../contract/path.ts";
import { isJsonQuery } from "../contract/request.ts";
import { isCustomBody, isNoBody } from "../contract/response.ts";
import type { FlatRequestInput } from "../contract/validate.ts";
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
	segment: "pathParams" | "query" | "headers",
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
	origin: string,
	route: RouteDeclaration,
	args: FlatRequestInput | undefined,
	unknownRequestKeys: "throw" | "strip",
): {
	url: string;
	body?: BodyInit | null;
	contentType?: string;
	headers?: Record<string, string>;
} => {
	let urlBase = `${origin}${route.path}`;
	if (!args) return { url: urlBase };

	const request = groupRequestInput(route, args, { unknownRequestKeys });
	const { body, query, pathParams, headers } = request;

	urlBase = `${origin}${serializeParams(route, pathParams)}${serializeQuery(route, query)}`;

	if (isCustomBody(route.body)) {
		const contentType = route.body.contentType;
		return {
			url: urlBase,
			body: serializeCustomBody(body, contentType),
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
	origin: string;
	fetch?: FetchLike;
	fetchOptions?: ApiClientFetchOptions;
	getGlobalHeaders?: GetHeadersFn;
	nextFetchTags?: NextFetchTagsOptions;
	timeoutMs?: number;
	unknownRequestKeys: "throw" | "strip";
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
): Promise<{ rawResponse: Response; cleanup: () => void }> => {
	const { requestArgs, options: fetchOptions } = extractArgs(route, args);
	const {
		url,
		body,
		contentType,
		headers: requestHeaders,
	} = constructBaseRequest(
		options.origin,
		route,
		requestArgs,
		options.unknownRequestKeys,
	);

	const signalState = createRequestSignal(
		fetchOptions?.signal,
		options.timeoutMs,
	);
	const headers = (await options.getGlobalHeaders?.()) ?? {};
	assertNoContentTypeHeader(headers);

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
		const rawResponse = await fetchImpl(url, init);

		return {
			rawResponse,
			cleanup: () => signalState?.cleanup(),
		};
	} catch (error) {
		signalState?.cleanup();
		throw error;
	}
};
