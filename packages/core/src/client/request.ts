import type { RouteDeclaration } from "../contract/route.ts";
import { isCustomBody, isNoBody } from "../contract/route.ts";
import { groupRequestInput, pathParamPattern } from "../contract/validate.ts";
import type {
	ApiClientFetchOptions,
	FetchArgs,
	FetchOptions,
	GetHeadersFn,
	PrepareFetchFn,
	RuntimeArgs,
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
	if (!route.request) return false;
	if (route.request.query || route.request.params || route.request.headers) {
		return true;
	}
	if (isCustomBody(route.request.body)) return true;
	return Boolean(route.request.body && !isNoBody(route.request.body));
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
			'ApiClient getHeaders() must not return a "content-type" header. Use customBody({ schema, contentType }) on the route declaration instead.',
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
	segment: "params" | "query" | "headers",
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
	params: Record<string, unknown> | undefined,
) => {
	return route.path.replace(pathParamPattern, (_, key: string) => {
		const value = stringifyRequestValue(route, "params", key, params?.[key]);
		if (value === undefined) {
			throw new Error(
				`Invalid params key "${key}" for ${route.method} ${route.path}. Expected string, number, or boolean.`,
			);
		}
		return encodeURIComponent(value);
	});
};

const serializeQuery = (
	route: RouteDeclaration,
	query: Record<string, unknown> | undefined,
) => {
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
	args: RuntimeArgs | undefined,
	unknownRequestKeys: "throw" | "strip",
): {
	url: string;
	body?: BodyInit | null;
	contentType?: string;
	headers?: Record<string, string>;
} => {
	let urlBase = `${baseUrl}${route.path}`;
	if (!args) return { url: urlBase };

	const request = groupRequestInput(route, args, { unknownRequestKeys });
	const { body, query, params, headers } = request;

	urlBase = `${baseUrl}${serializeParams(route, params)}${serializeQuery(route, query)}`;

	if (isCustomBody(route.request?.body)) {
		const contentType = route.request.body.contentType;
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
	const requestArgs = takesRequestInput(route) ? args[0] : undefined;
	const options = requestArgs ? args[1] : args[0];
	return { requestArgs, options } as {
		requestArgs?: unknown;
		options?: FetchOptions;
	};
};

export type ExecuteRequestOptions = {
	baseUrl: string;
	fetchOptions?: ApiClientFetchOptions;
	getHeaders?: GetHeadersFn;
	prepareFetch?: PrepareFetchFn;
	timeoutMs?: number;
	unknownRequestKeys: "throw" | "strip";
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
		options.baseUrl,
		route,
		requestArgs as RuntimeArgs,
		options.unknownRequestKeys,
	);

	const signalState = createRequestSignal(
		fetchOptions?.signal,
		options.timeoutMs,
	);
	const headers = (await options.getHeaders?.()) ?? {};
	assertNoContentTypeHeader(headers);

	try {
		const init: RequestInit = {
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
		};
		const preparedInit =
			(await options.prepareFetch?.({
				route,
				request: requestArgs as RuntimeArgs | undefined,
				url,
				init,
			})) ?? init;
		const rawResponse = await fetch(url, preparedInit);

		return {
			rawResponse,
			cleanup: () => signalState?.cleanup(),
		};
	} catch (error) {
		signalState?.cleanup();
		throw error;
	}
};
