import { HttpError } from "./httpError.ts";
import {
	resolveBodyCodec,
	defaultBodyCodecs,
	normalizeMediaType,
	type BodyCodec,
} from "../codecs/index.ts";
import type { RouteDeclaration, RouteTree } from "../contract/contract.ts";
import type { SseEvent } from "../sse.ts";
import type {
	ResponseDeclaration,
	DeclaredClientResponse,
	SuccessfulDeclaredClientResponse,
} from "../contract/response.ts";
import { getRouteResponses } from "../contract/response.ts";
import {
	validateStandardSchema,
	type StandardSchemaV1,
} from "../standard-schema/index.ts";
import { parseSseStream } from "./stream.ts";
import type { FetchArgs } from "./request.ts";

type Simplify<T> = T extends unknown ? { [TKey in keyof T]: T[TKey] } : never;

type WithResponseMetadata<TResponse, TMetadata> = TResponse extends unknown
	? Simplify<TResponse & TMetadata>
	: never;

type RouteDeclaredResponse<E extends RouteDeclaration> = WithResponseMetadata<
	DeclaredClientResponse<E>,
	{
		headers: Headers;
	}
>;

/**
 * Infers a route's client result.
 *
 * @remarks Routes declared with `.response()` produce status-discriminated
 * envelopes. Routes declared with `.output()` produce their output directly.
 * Pass a route tree to infer a matching tree of results.
 *
 * @see {@link https://rest-rpc.dev/docs/client/fetch-client#infer-client-types}
 * @see {@link https://rest-rpc.dev/docs/client/fetch-client#call-routes}
 */
export type InferClientResponse<T extends RouteTree> = T extends {
	readonly "~restrpc": infer TRoute extends RouteDeclaration;
}
	? ClientResponseForDeclaration<TRoute>
	: {
			[K in keyof T]: T[K] extends RouteTree
				? InferClientResponse<T[K]>
				: never;
		};

/**
 * Infers the `data` of each event received from a streaming route.
 *
 * @remarks Unwraps the `SseEvent` values of successful stream responses.
 * Routes without a stream response infer `never`. Pass a route tree to infer
 * a matching tree of event data types.
 *
 * @see {@link https://rest-rpc.dev/docs/client/fetch-client#infer-client-types}
 * @see {@link https://rest-rpc.dev/docs/client/fetch-client#consume-streams}
 */
export type InferClientStreamData<T extends RouteTree> = T extends {
	readonly "~restrpc": infer TRoute extends RouteDeclaration;
}
	? ClientStreamDataForDeclaration<TRoute>
	: {
			[K in keyof T]: T[K] extends RouteTree
				? InferClientStreamData<T[K]>
				: never;
		};

type ClientStreamDataForDeclaration<E extends RouteDeclaration> =
	SuccessfulDeclaredClientResponse<E> extends infer TResponse
		? TResponse extends { body: AsyncIterable<SseEvent<infer TData>> }
			? TData
			: never
		: never;

export type ClientResponseForDeclaration<E extends RouteDeclaration> =
	E extends {
		output: "output";
	}
		? ProcedureRouteOutput<E>
		: RouteDeclaredResponse<E>;

type ProcedureRouteOutput<TRoute extends RouteDeclaration> =
	SuccessfulDeclaredClientResponse<TRoute> extends infer TResponse
		? TResponse extends { body: infer TBody }
			? TBody
			: never
		: never;

const getResponseSchema = (
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
	schema: StandardSchemaV1 | undefined,
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

export type RouteRequestFn = <E extends RouteDeclaration & { path: string }>(
	route: E,
	routePath: readonly string[],
	...args: FetchArgs<E>
) => Promise<Response>;

export const fetchResponse = async <
	E extends RouteDeclaration & { path: string },
>(
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
	assertResponseContentType(schema.contentType, rawResponse, value);
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

export const fetchSuccess = async <
	E extends RouteDeclaration & { path: string },
>(
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
