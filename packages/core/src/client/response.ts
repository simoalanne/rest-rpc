import type { RouteDeclaration } from "../contract/contract.ts";
import { isStandardSchema } from "../contract/request.ts";
import type {
	ClientSuccessBody,
	CustomBody,
	ResponseBodySchema,
	ResponseDeclaration,
} from "../contract/response.ts";
import {
	getResponseBody,
	getResponseHeaders,
	getRouteResponses,
	isCustomBody,
	isNoBody,
	isStream,
} from "../contract/response.ts";
import { validateStandardSchema } from "../standard-schema/index.ts";
import { isHttpRouteNode, isSuccessStatus } from "./routes.ts";
import { parseNdjsonStream } from "./stream.ts";
import type { ClientFetchResponse, FetchArgs } from "./types.ts";

export const getResponseSchema = (
	route: RouteDeclaration,
	status: number,
): ResponseDeclaration | undefined => {
	if (!isHttpRouteNode(route)) return undefined;
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
			throw new Error("Backend returned an unsupported stream response");
		}

		if (!rawResponse.body) {
			throw new Error("Backend returned an empty stream response");
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
			"Backend returned an unsupported custom response content-type.",
		);
	}

	return contentType;
};

const customResponseMetadata = (schema: CustomBody, rawResponse: Response) => ({
	contentType: resolveDeclaredContentType(
		Array.isArray(schema.contentType)
			? schema.contentType
			: [schema.contentType as string],
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

const readHeaderValue = (headers: Headers, name: string) =>
	headers.get(name) ?? undefined;

const readDeclaredHeaders = async (
	schema: ResponseDeclaration,
	rawResponse: Response,
	validate: boolean,
) => {
	const headers = getResponseHeaders(schema);
	if (!headers) return {};

	const responseHeaders: Record<string, unknown> = {};
	for (const [name, headerSchema] of Object.entries(headers)) {
		const value = readHeaderValue(rawResponse.headers, name);
		if (!validate) {
			if (value !== undefined) responseHeaders[name] = value;
			continue;
		}

		const result = await validateStandardSchema(headerSchema, value);
		if (result.issues) throw result.issues;
		if (result.value !== undefined) responseHeaders[name] = result.value;
	}

	return { responseHeaders };
};

export type RouteRequestFn = <E extends RouteDeclaration>(
	route: E,
	...args: FetchArgs<E>
) => Promise<Response>;

export const fetchResponse = async <E extends RouteDeclaration>(
	request: RouteRequestFn,
	validateResponse: boolean,
	route: E,
	...args: FetchArgs<E>
): Promise<ClientFetchResponse<E>> => {
	const rawResponse = await request(route, ...args);

	const schema = getResponseSchema(route, rawResponse.status);
	if (!schema) {
		return {
			declared: false,
			status: rawResponse.status,
			body: await readUnknownBody(rawResponse),
			headers: rawResponse.headers,
		} as ClientFetchResponse<E>;
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
	} as ClientFetchResponse<E>;
};

export const fetchSuccess = async <E extends RouteDeclaration>(
	fetchRouteResponse: (
		route: E,
		...args: FetchArgs<E>
	) => Promise<ClientFetchResponse<E>>,
	route: E,
	...args: FetchArgs<E>
): Promise<ClientSuccessBody<E>> => {
	const response = await fetchRouteResponse(route, ...args);

	if (!response.declared || !isSuccessStatus(response.status)) {
		throw new Error("Request did not return a declared success response");
	}

	return response.body as ClientSuccessBody<E>;
};
