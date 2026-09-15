import type { RouteDeclaration } from "../contract/contract.ts";
import type {
	DeclaredClientResponse,
	ResponseBodySchema,
	ResponseDeclaration,
	SuccessfulDeclaredClientResponse,
} from "../contract/response.ts";
import { getRouteResponses } from "../contract/response.ts";
import { validateStandardSchema } from "../standard-schema/index.ts";
import { parseNdjsonStream } from "./stream.ts";
import type { ApiClientBodyParser, FetchArgs } from "./types.ts";

type FetchedRouteResponse<E extends RouteDeclaration> =
	DeclaredClientResponse<E> extends infer TResponse
		? TResponse extends object
			? TResponse & { headers: Headers }
			: never
		: never;

const isSuccessStatus = (status: number) => status >= 200 && status < 300;

export const getResponseSchema = (
	route: RouteDeclaration,
	status: number,
): ResponseDeclaration | undefined => {
	const entry = Object.entries(getRouteResponses(route)).find(
		([declaredStatus]) => Number(declaredStatus) === status,
	);
	return entry?.[1];
};

/** Reads an unvalidated response according to its Content-Type header. */
export const readUnvalidatedResponse = async (
	rawResponse: Response,
	bodyParser: ApiClientBodyParser = defaultBodyParser,
) => {
	const contentType = rawResponse.headers.get("content-type") ?? undefined;
	const normalizedContentType = normalizeContentType(contentType ?? "");
	let body: unknown;

	if (!contentType) {
		body = undefined;
	} else if (isJsonContentType(normalizedContentType)) {
		body = await rawResponse.json();
	} else if (normalizedContentType === "application/x-ndjson") {
		if (!rawResponse.body) {
			throw new Error("Server returned an empty stream response");
		}
		body = parseNdjsonStream(undefined, rawResponse.body, false);
	} else {
		body = await bodyParser(rawResponse);
	}
	const isCustomContentType =
		contentType !== undefined &&
		normalizedContentType !== "application/x-ndjson" &&
		!isJsonContentType(normalizedContentType);

	return {
		status: rawResponse.status,
		body,
		headers: rawResponse.headers,
		responseHeaders: Object.fromEntries(rawResponse.headers.entries()),
		...(isCustomContentType ? { contentType: normalizedContentType } : {}),
	};
};

export const readDeclaredBody = async (
	schema: ResponseBodySchema | undefined,
	rawResponse: Response,
	validate: boolean,
	customContentType?: string | readonly string[],
	bodyParser: ApiClientBodyParser = defaultBodyParser,
) => {
	if (schema === undefined) return undefined;

	if (customContentType !== undefined) {
		const contentType = resolveDeclaredContentType(
			Array.isArray(customContentType)
				? customContentType
				: [customContentType as string],
			rawResponse,
		);
		if (normalizeContentType(contentType) === "application/x-ndjson") {
			if (!rawResponse.body) {
				throw new Error("Server returned an empty stream response");
			}
			return parseNdjsonStream(schema, rawResponse.body, validate);
		}
		const value = await bodyParser(rawResponse);
		if (!validate) return value;

		const result = await validateStandardSchema(schema, value);
		if (result.issues) throw result.issues;
		return result.value;
	}

	const value = await rawResponse.json();
	if (!validate) return value;

	const result = await validateStandardSchema(schema, value);
	if (result.issues) throw result.issues;
	return result.value;
};

const normalizeContentType = (contentType: string) =>
	contentType.split(";")[0]?.trim().toLowerCase() ?? "";

const isJsonContentType = (contentType: string) =>
	contentType === "application/json" || contentType.endsWith("+json");

const defaultBodyParser: ApiClientBodyParser = async (rawResponse) => {
	const normalized = normalizeContentType(
		rawResponse.headers.get("content-type") ?? "",
	);
	if (isJsonContentType(normalized)) {
		return rawResponse.json();
	}
	if (normalized === "application/x-www-form-urlencoded") {
		return new URLSearchParams(await rawResponse.text());
	}
	if (normalized === "multipart/form-data") return rawResponse.formData();
	if (normalized.startsWith("text/")) return rawResponse.text();
	return new Uint8Array(await rawResponse.arrayBuffer());
};

const resolveDeclaredContentType = (
	contentTypes: readonly string[],
	rawResponse: Response,
) => {
	const responseContentType = rawResponse.headers.get("content-type");
	const contentType =
		responseContentType &&
		contentTypes.find((value) => {
			const declared = normalizeContentType(value);
			const received = normalizeContentType(responseContentType);
			return (
				declared === received ||
				(declared === "application/json" && received.endsWith("+json"))
			);
		});

	if (!contentType) {
		throw new Error(
			"Server returned an unsupported custom response content-type.",
		);
	}

	return contentType;
};

const declaredResponseMetadata = (
	schema: ResponseDeclaration,
	rawResponse: Response,
) => {
	const { contentType } = schema;
	if (contentType !== undefined) {
		if (
			contentType === "application/json" ||
			contentType === "application/x-ndjson"
		) {
			return {};
		}
		return {
			contentType: resolveDeclaredContentType(
				Array.isArray(contentType) ? contentType : [contentType as string],
				rawResponse,
			),
		};
	}
	return {};
};

const readDeclaredHeaders = async (
	schema: ResponseDeclaration,
	rawResponse: Response,
	validate: boolean,
) => {
	const { headers } = schema;
	if (!headers) return {};

	const rawHeaders = Object.fromEntries(rawResponse.headers.entries());
	if (!validate) return { responseHeaders: rawHeaders };

	const result = await validateStandardSchema(headers, rawHeaders);
	if (result.issues) throw result.issues;
	return { responseHeaders: result.value };
};

export type RouteRequestFn = <E extends RouteDeclaration>(
	route: E,
	routePath: readonly string[],
	...args: FetchArgs<E>
) => Promise<Response>;

export const fetchResponse = async <E extends RouteDeclaration>(
	request: RouteRequestFn,
	validateResponse: boolean,
	bodyParser: ApiClientBodyParser | undefined,
	route: E,
	routePath: readonly string[],
	...args: FetchArgs<E>
): Promise<FetchedRouteResponse<E>> => {
	const rawResponse = await request(route, routePath, ...args);
	if (
		!Number.isInteger(rawResponse.status) ||
		rawResponse.status < 100 ||
		rawResponse.status > 599
	) {
		throw new Error(
			`Server returned invalid HTTP response status "${rawResponse.status}".`,
		);
	}

	const schema = getResponseSchema(route, rawResponse.status);
	if (!schema) {
		throw new Error("Request did not return a declared response");
	}
	if (!validateResponse) {
		return readUnvalidatedResponse(rawResponse, bodyParser) as Promise<
			FetchedRouteResponse<E>
		>;
	}

	return {
		status: rawResponse.status,
		body: await readDeclaredBody(
			schema.body,
			rawResponse,
			validateResponse,
			schema.contentType,
			bodyParser,
		),
		headers: rawResponse.headers,
		...(await readDeclaredHeaders(schema, rawResponse, validateResponse)),
		...declaredResponseMetadata(schema, rawResponse),
	} as FetchedRouteResponse<E>;
};

export const fetchSuccess = async <E extends RouteDeclaration>(
	fetchRouteResponse: (
		route: E,
		routePath: readonly string[],
		...args: FetchArgs<E>
	) => Promise<{ status: number; body?: unknown }>,
	route: E,
	routePath: readonly string[],
	...args: FetchArgs<E>
): Promise<SuccessfulClientResponseBody<E>> => {
	const response = await fetchRouteResponse(route, routePath, ...args);

	if (!("body" in response) || !isSuccessStatus(response.status)) {
		throw new Error("Request did not return a declared success response");
	}

	return response.body as SuccessfulClientResponseBody<E>;
};

type SuccessfulClientResponseBody<E extends RouteDeclaration> =
	SuccessfulDeclaredClientResponse<E> extends infer TResponse
		? TResponse extends { body: infer TBody }
			? TBody
			: never
		: never;
