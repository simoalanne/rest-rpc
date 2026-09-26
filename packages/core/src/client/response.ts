import { HttpError } from "./httpError.ts";
import {
	resolveBodyCodec,
	defaultBodyCodecs,
	normalizeMediaType,
	type BodyCodec,
} from "../codecs/index.ts";
import type { RouteDeclaration } from "../contract/contract.ts";
import type { ResponseDeclaration } from "../contract/response.ts";
import { getRouteResponses } from "../contract/response.ts";
import {
	validateStandardSchema,
	type StandardSchemaV1,
} from "../standard-schema/index.ts";
import { parseSseStream } from "./stream.ts";
import type { FetchArgs } from "./types.ts";

export const getResponseSchema = (
	route: RouteDeclaration,
	status: number,
): ResponseDeclaration | undefined => {
	const entry = Object.entries(getRouteResponses(route)).find(
		([declaredStatus]) => Number(declaredStatus) === status,
	);
	return entry?.[1];
};

const assertResponseContentType = (
	declared: string | readonly string[] | undefined,
	rawResponse: Response,
	body: unknown,
) => {
	const received = normalizeMediaType(
		rawResponse.headers.get("content-type") ?? "",
	);
	if (!received || declared === undefined) return;
	const allowed = typeof declared === "string" ? [declared] : declared;
	if (
		!allowed.some((contentType) => normalizeMediaType(contentType) === received)
	) {
		throw new HttpError(rawResponse.status, body, {
			cause: new Error("Server returned an unsupported response content-type."),
		});
	}
};

const STREAM_CONTENT_TYPE = "text/event-stream";

const readStreamResponse = (
	schema: StandardSchemaV1,
	rawResponse: Response,
	validate: boolean,
) => {
	if (
		normalizeMediaType(rawResponse.headers.get("content-type")) !==
		STREAM_CONTENT_TYPE
	) {
		throw new Error("Server returned an unsupported stream content-type.");
	}

	if (rawResponse.body === null) {
		throw new Error("Server returned no stream body");
	}
	return parseSseStream(schema, rawResponse.body, validate, rawResponse.status);
};

const validateResponseBody = async (
	schema: StandardSchemaV1 | undefined,
	value: unknown,
	validate: boolean,
	status: number,
) => {
	if (!validate || schema === undefined) return value;
	const result = await validateStandardSchema(schema, value);
	if (result.issues)
		throw new HttpError(status, value, { cause: result.issues });
	return result.value;
};

const readDeclaredHeaders = async (
	schema: ResponseDeclaration,
	rawResponse: Response,
	validate: boolean,
	body: unknown,
) => {
	const { headers } = schema;
	if (!headers) return undefined;

	const rawHeaders = Object.fromEntries(rawResponse.headers.entries());
	if (!validate) return rawHeaders;

	const result = await validateStandardSchema(headers, rawHeaders);
	if (result.issues)
		throw new HttpError(rawResponse.status, body, { cause: result.issues });
	return result.value;
};

export type RouteRequestFn = <E extends RouteDeclaration>(
	route: E,
	routePath: readonly string[],
	...args: FetchArgs<E>
) => Promise<Response>;

export const fetchResponse = async <E extends RouteDeclaration>(
	request: RouteRequestFn,
	validateResponse: boolean,
	bodyCodecs: readonly BodyCodec<Response>[] | undefined,
	route: E,
	routePath: readonly string[],
	...args: FetchArgs<E>
) => {
	const rawResponse = await request(route, routePath, ...args);

	const schema = getResponseSchema(route, rawResponse.status);
	if (schema?.kind === "stream") {
		const body = readStreamResponse(schema.body, rawResponse, validateResponse);
		return {
			status: rawResponse.status,
			headers: rawResponse.headers,
			responseHeaders: await readDeclaredHeaders(
				schema,
				rawResponse,
				validateResponse,
				body,
			),
			body,
		};
	}

	const mediaType = normalizeMediaType(rawResponse.headers.get("content-type"));
	let value: unknown;
	if (mediaType && rawResponse.body !== null) {
		const resolvedCodec = resolveBodyCodec(mediaType, [
			...(bodyCodecs ?? []),
			...defaultBodyCodecs,
		]);
		value = await resolvedCodec?.deserialize?.(rawResponse);
	}

	if (!schema) {
		throw new HttpError(rawResponse.status, value);
	}
	if (route.source !== "generated") {
		assertResponseContentType(schema.contentType, rawResponse, value);
	}
	const responseMetadata = {
		status: rawResponse.status,
		headers: rawResponse.headers,
		responseHeaders: await readDeclaredHeaders(
			schema,
			rawResponse,
			validateResponse,
			value,
		),
	};
	const body = await validateResponseBody(
		schema.body,
		value,
		validateResponse,
		rawResponse.status,
	);

	return {
		...responseMetadata,
		body,
	};
};

const isSuccessStatus = (status: number) => status >= 200 && status < 300;

export const fetchSuccess = async <E extends RouteDeclaration>(
	fetchRouteResponse: (
		route: E,
		routePath: readonly string[],
		...args: FetchArgs<E>
	) => Promise<{ status: number; body?: unknown }>,
	route: E,
	routePath: readonly string[],
	...args: FetchArgs<E>
) => {
	const response = await fetchRouteResponse(route, routePath, ...args);

	if (!isSuccessStatus(response.status)) {
		throw new HttpError(response.status, response.body);
	}

	return response.body;
};
