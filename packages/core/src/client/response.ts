import type { CustomBody } from "../contract/body.ts";
import { isCustomBody, isNoBody, isStream } from "../contract/body.ts";
import type { RouteDeclaration } from "../contract/contract.ts";
import type {
	ClientResponseBody,
	ResponseBodySchema,
	ResponseDeclaration,
} from "../contract/response.ts";
import {
	getResponseBody,
	getResponseHeaders,
	getRouteResponses,
} from "../contract/response.ts";
import {
	isStandardSchema,
	validateStandardSchema,
} from "../standard-schema/index.ts";
import { parseNdjsonStream } from "./stream.ts";
import type { ClientResponse, FetchArgs } from "./types.ts";

const isSuccessStatus = (status: number) => status >= 200 && status < 300;

/** Header used to describe bodies returned to server-first clients. */
export const SERVER_FIRST_RESPONSE_KIND_HEADER = "X-Rest-Rpc-Response-Kind";

type ServerFirstResponseKind =
	| "empty"
	| "json"
	| "ndjson"
	| "custom"
	| "custom-stream";

const serverFirstResponseKinds: readonly ServerFirstResponseKind[] = [
	"empty",
	"json",
	"ndjson",
	"custom",
	"custom-stream",
];

const isServerFirstResponseKind = (
	value: string | undefined,
): value is ServerFirstResponseKind =>
	value !== undefined &&
	serverFirstResponseKinds.some((responseKind) => responseKind === value);

const parseHeaderOptions = (header: string) => {
	const options = new Map<string, string>();
	for (const field of header.trim().split(/\s+/u)) {
		const separatorIndex = field.indexOf("=");
		if (separatorIndex <= 0 || separatorIndex !== field.lastIndexOf("=")) {
			return undefined;
		}

		const name = field.slice(0, separatorIndex);
		const value = field.slice(separatorIndex + 1);
		if (!value || options.has(name)) return undefined;
		options.set(name, value);
	}
	return options;
};

const getServerFirstResponseKind = (
	rawResponse: Response,
): ServerFirstResponseKind => {
	const header = rawResponse.headers.get(SERVER_FIRST_RESPONSE_KIND_HEADER);
	if (!header) {
		throw new Error(
			`Server response is missing required ${SERVER_FIRST_RESPONSE_KIND_HEADER} header to use server-first client.`,
		);
	}

	const options = parseHeaderOptions(header);
	const hasExpectedOptions =
		options?.size === 2 && options.has("v") && options.has("kind");
	const hasSupportedVersion = options?.get("v") === "1";
	const kind = options?.get("kind");
	if (
		!hasExpectedOptions ||
		!hasSupportedVersion ||
		!isServerFirstResponseKind(kind)
	) {
		throw new Error("Server returned an invalid server-first response kind.");
	}

	return kind;
};

export const getResponseSchema = (
	route: RouteDeclaration,
	status: number,
): ResponseDeclaration | undefined => {
	if (route.mode === "webSocket") return undefined;
	const entry = Object.entries(getRouteResponses(route)).find(
		([declaredStatus]) => Number(declaredStatus) === status,
	);
	return entry?.[1];
};

export const readUnknownBody = async (rawResponse: Response) => {
	const text = await rawResponse.text();
	if (!text) return undefined;

	try {
		return JSON.parse(text) as unknown;
	} catch {
		return text;
	}
};

/** Reads a response using server-first response-kind metadata. */
export const readServerFirstResponse = async (rawResponse: Response) => {
	const kind = getServerFirstResponseKind(rawResponse);
	let body: unknown;
	let contentType: string | undefined;

	switch (kind) {
		case "empty":
			body = undefined;
			break;
		case "json":
			body = await rawResponse.json();
			break;
		case "ndjson":
			if (!rawResponse.body) {
				throw new Error("Server returned an empty stream response");
			}
			body = parseNdjsonStream(undefined, rawResponse.body, false);
			break;
		case "custom":
		case "custom-stream":
			contentType = rawResponse.headers.get("content-type") ?? undefined;
			if (!contentType) {
				throw new Error(
					"Server response is missing required Content-Type header for a custom response kind.",
				);
			}
			body = rawResponse;
			break;
	}

	return {
		declared: true as const,
		status: rawResponse.status,
		body,
		headers: rawResponse.headers,
		responseHeaders: Object.fromEntries(rawResponse.headers.entries()),
		...(contentType ? { contentType } : {}),
	};
};

export const readDeclaredBody = async (
	schema: ResponseBodySchema,
	rawResponse: Response,
	validate: boolean,
) => {
	if (isNoBody(schema)) return undefined;

	if (isCustomBody(schema)) return rawResponse;

	if (isStream(schema)) {
		if (isCustomBody(schema.schema)) return rawResponse;
		if (!isStandardSchema(schema.schema)) {
			throw new Error("Server returned an unsupported stream response");
		}

		if (!rawResponse.body) {
			throw new Error("Server returned an empty stream response");
		}

		return parseNdjsonStream(schema.schema, rawResponse.body, validate);
	}

	const value = await rawResponse.json();
	if (!validate) return value;

	const result = await validateStandardSchema(schema, value);
	if (result.issues) throw result.issues;
	return result.value;
};

const normalizeContentType = (contentType: string) =>
	contentType.split(";")[0]?.trim().toLowerCase();

const resolveDeclaredContentType = (
	contentTypes: readonly string[],
	rawResponse: Response,
) => {
	const responseContentType = rawResponse.headers.get("content-type");
	const contentType =
		responseContentType &&
		contentTypes.find(
			(value) =>
				normalizeContentType(value) ===
				normalizeContentType(responseContentType),
		);

	if (!contentType) {
		throw new Error(
			"Server returned an unsupported custom response content-type.",
		);
	}

	return contentType;
};

const customResponseMetadata = (schema: CustomBody, rawResponse: Response) => ({
	contentType: resolveDeclaredContentType(
		Array.isArray(schema.contentType)
			? schema.contentType
			: schema.contentType
				? [schema.contentType]
				: [],
		rawResponse,
	),
});

const declaredResponseMetadata = (
	schema: ResponseDeclaration,
	rawResponse: Response,
) => {
	const body = getResponseBody(schema);
	if (isCustomBody(body)) return customResponseMetadata(body, rawResponse);
	if (isStream(body) && isCustomBody(body.schema)) {
		return customResponseMetadata(body.schema, rawResponse);
	}
	return {};
};

const readDeclaredHeaders = async (
	schema: ResponseDeclaration,
	rawResponse: Response,
	validate: boolean,
) => {
	const headers = getResponseHeaders(schema);
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
	route: E,
	routePath: readonly string[],
	...args: FetchArgs<E>
): Promise<ClientResponse<E>> => {
	const rawResponse = await request(route, routePath, ...args);

	const schema = getResponseSchema(route, rawResponse.status);
	if (!schema) {
		if (route.strictStatusCodes === true) {
			throw new Error("Request did not return a declared response");
		}
		return {
			declared: false,
			status: rawResponse.status,
			body: await readUnknownBody(rawResponse),
			headers: rawResponse.headers,
		} as ClientResponse<E>;
	}

	return {
		declared: true,
		status: rawResponse.status,
		body: await readDeclaredBody(
			getResponseBody(schema),
			rawResponse,
			validateResponse,
		),
		headers: rawResponse.headers,
		...(await readDeclaredHeaders(schema, rawResponse, validateResponse)),
		...declaredResponseMetadata(schema, rawResponse),
	} as ClientResponse<E>;
};

export const fetchSuccess = async <E extends RouteDeclaration>(
	fetchRouteResponse: (
		route: E,
		routePath: readonly string[],
		...args: FetchArgs<E>
	) => Promise<ClientResponse<E>>,
	route: E,
	routePath: readonly string[],
	...args: FetchArgs<E>
): Promise<ClientResponseBody<E>> => {
	const response = await fetchRouteResponse(route, routePath, ...args);

	if (!response.declared || !isSuccessStatus(response.status)) {
		throw new Error("Request did not return a declared success response");
	}

	return response.body as ClientResponseBody<E>;
};
