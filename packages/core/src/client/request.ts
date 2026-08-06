import type { RouteDeclaration } from "../contract/route.ts";
import { isCustomBody, isNoBody } from "../contract/route.ts";
import { groupRequestInput } from "../contract/validate.ts";
import type {
	ApiClientFetchOptions,
	FetchArgs,
	FetchOptions,
	GetHeadersFn,
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

const hasHeader = (headers: Record<string, string>, name: string) =>
	Object.keys(headers).some((header) => header.toLowerCase() === name);

export const assertNoContentTypeHeader = (headers: Record<string, string>) => {
	if (hasHeader(headers, "content-type")) {
		throw new Error(
			'ApiClient getHeaders() must not return a "content-type" header. Use customBody({ contentType }) on the route declaration instead.',
		);
	}
};

export const isJsonContentType = (contentType: string) =>
	contentType.split(";")[0]?.trim().toLowerCase() === "application/json";

export const serializeCustomBody = (body: unknown, contentType: string) =>
	isJsonContentType(contentType)
		? JSON.stringify(body)
		: (body as BodyInit | null | undefined);

const stringifyHeaders = (headers: Record<string, unknown> | undefined) =>
	Object.fromEntries(
		Object.entries(headers ?? {}).map(([key, value]) => [key, String(value)]),
	);

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

	if (params) {
		for (const [k, v] of Object.entries(params)) {
			urlBase = urlBase.replace(`:${k}`, encodeURIComponent(String(v)));
		}
	}

	if (query) {
		Object.entries(query).forEach(([k, v]) => {
			if (v === undefined || v === null) {
				delete query[k];
			}
		});

		urlBase += `?${new URLSearchParams(query as Record<string, string>)}`;
	}

	if (isCustomBody(route.request?.body)) {
		const contentType = route.request.body.contentType;
		return {
			url: urlBase,
			body: serializeCustomBody(body, contentType),
			contentType,
			headers: stringifyHeaders(headers),
		};
	}

	return {
		url: urlBase,
		body: body ? JSON.stringify(body) : undefined,
		contentType: body ? "application/json" : undefined,
		headers: stringifyHeaders(headers),
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
		const rawResponse = await fetch(url, {
			...options.fetchOptions,
			...fetchOptions,
			method: route.method,
			body,
			headers: {
				...headers,
				...requestHeaders,
				...(contentType ? { "Content-Type": contentType } : {}),
			},
			signal: signalState?.signal ?? fetchOptions?.signal,
		});

		return {
			rawResponse,
			cleanup: () => signalState?.cleanup(),
		};
	} catch (error) {
		signalState?.cleanup();
		throw error;
	}
};
