import type { RouteDeclaration } from "../contract/route.ts";
import { isCustomBody } from "../contract/route.ts";
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

export const takesRequestInput = (route: RouteDeclaration) =>
	Boolean(route.request);

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
		},
	);
};

export const serializeCustomBody = (body: unknown, contentType: string) =>
	isJsonContentType(contentType)
		? JSON.stringify(body)
		: (body as BodyInit | null | undefined);

const validateOutgoingRequestSegment = (
	route: RouteDeclaration,
	segment: "body" | "query" | "params",
	value: unknown,
) => {
	const declaredSchema = route.request?.[segment];
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
	},
) => {
	validateOutgoingRequestSegment(route, "body", request.body);
	validateOutgoingRequestSegment(route, "query", request.query);
	validateOutgoingRequestSegment(route, "params", request.params);
};

export const constructBaseRequest = (
	baseUrl: string,
	route: RouteDeclaration,
	args: RuntimeArgs | undefined,
	unknownRequestKeys: "throw" | "strip",
	validation: RuntimeValidation,
): { url: string; body?: BodyInit | null; contentType?: string } => {
	let urlBase = `${baseUrl}${route.path}`;
	if (!args) return { url: urlBase };

	const request = groupKeysToRequest(
		args,
		route,
		unknownRequestKeys,
	);
	const { body, query, params } = request;

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
		};
	}

	return {
		url: urlBase,
		body: body ? JSON.stringify(body) : undefined,
		contentType: body ? "application/json" : undefined,
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
	const { url, body, contentType } = constructBaseRequest(
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
