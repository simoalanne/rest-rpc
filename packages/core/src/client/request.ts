import type { RouteDeclaration } from "../contract/route.ts";
import { isCustomBody, isNoBody } from "../contract/route.ts";
import { validateStandardSchemaSync } from "../standard-schema/index.ts";
import type {
	ApiClientFetchOptions,
	FetchArgs,
	FetchOptions,
	GetHeadersFn,
	RuntimeArgs,
	RuntimeValidation,
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

export const groupKeysToRequest = (
	args: RuntimeArgs,
	route: RouteDeclaration,
	unknownRequestKeys: "throw" | "strip",
) => {
	const isCustomRequestBody = isCustomBody(route.request?.body);
	const requestKeys = route.request?.requestKeys;

	if (!requestKeys && route.request) {
		throw new Error(
			`Missing request key metadata for ${route.method} ${route.path}. Call router() or provide request.requestKeys before initializing the client.`,
		);
	}

	return Object.entries(args).reduce(
		(acc, [k, v]) => {
			if (k === "body" && isCustomRequestBody) {
				acc.body = v;
				return acc;
			}

			const bucket = requestKeys?.[k];
			if (bucket) {
				if (!acc[bucket]) acc[bucket] = {};
				(acc[bucket] as Record<string, unknown>)[k] = v;
				return acc;
			}

			if (unknownRequestKeys === "strip") {
				return acc;
			}

			throw new Error(
				`Unknown request key "${k}" for ${route.method} ${route.path}.`,
			);
		},
		{} as {
			body?: unknown;
			query?: Record<string, unknown>;
			params?: Record<string, unknown>;
			headers?: Record<string, unknown>;
		},
	);
};

export const serializeCustomBody = (body: unknown, contentType: string) =>
	isJsonContentType(contentType)
		? JSON.stringify(body)
		: (body as BodyInit | null | undefined);

const validateOutgoingRequestSegment = (
	route: RouteDeclaration,
	segment: "body" | "query" | "params" | "headers",
	value: unknown,
) => {
	if (segment === "headers") {
		const declaredSchema = route.request?.headers;
		if (!declaredSchema) return;
		const headers = value as Record<string, unknown> | undefined;
		for (const [headerName, schema] of Object.entries(declaredSchema)) {
			const result = validateStandardSchemaSync(schema, headers?.[headerName]);
			if (result.issues) throw result.issues;
		}
		return;
	}

	const declaredSchema = route.request?.[segment];
	if (isNoBody(declaredSchema)) return;
	const isCustomRequestBody = isCustomBody(declaredSchema);
	const schema = isCustomRequestBody ? declaredSchema.schema : declaredSchema;
	if (!schema) return;

	const result = validateStandardSchemaSync(schema, value);
	if (result.issues) throw result.issues;
};

const validateOutgoingRequest = (
	route: RouteDeclaration,
	request: {
		body?: unknown;
		query?: Record<string, unknown>;
		params?: Record<string, unknown>;
		headers?: Record<string, unknown>;
	},
) => {
	validateOutgoingRequestSegment(route, "body", request.body);
	validateOutgoingRequestSegment(route, "query", request.query);
	validateOutgoingRequestSegment(route, "params", request.params);
	validateOutgoingRequestSegment(route, "headers", request.headers);
};

const stringifyHeaders = (headers: Record<string, unknown> | undefined) =>
	Object.fromEntries(
		Object.entries(headers ?? {}).map(([key, value]) => [key, String(value)]),
	);

export const constructBaseRequest = (
	baseUrl: string,
	route: RouteDeclaration,
	args: RuntimeArgs | undefined,
	unknownRequestKeys: "throw" | "strip",
	validation: RuntimeValidation,
): {
	url: string;
	body?: BodyInit | null;
	contentType?: string;
	headers?: Record<string, string>;
} => {
	let urlBase = `${baseUrl}${route.path}`;
	if (!args) return { url: urlBase };

	const request = groupKeysToRequest(args, route, unknownRequestKeys);
	const { body, query, params, headers } = request;

	if (validation === "incoming-and-outgoing") {
		validateOutgoingRequest(route, request);
	}

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
	validation: RuntimeValidation;
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
		options.validation,
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
