import { HttpError } from "./httpError.ts";
import {
	resolveBodyCodec,
	defaultBodyCodecs,
	findDeclaredContentType,
	normalizeMediaType,
	type BodyCodec,
} from "../codecs/index.ts";
import type { RouteDeclaration, RouteTree } from "../contract/contract.ts";
import type { SseEvent } from "../contract/sse.ts";
import type {
	ResponseDeclaration,
	DeclaredClientResponse,
	ErrorDeclaredClientResponse,
	SuccessfulDeclaredClientResponse,
} from "../contract/response.ts";
import {
	validateStandardSchema,
	type StandardSchemaV1,
} from "../standard-schema/index.ts";
import { parseSseStream } from "./stream.ts";
import { validateResponseValue } from "./validateResponse.ts";
import type { FetchArgs } from "./request.ts";

/**
 * Infers a route's client result.
 *
 * @remarks Every route produces status-discriminated envelopes. Pass a route
 * tree to infer a matching tree of results.
 *
 * @see {@link https://rest-rpc.dev/docs/client/fetch-client#type-helpers}
 * @see {@link https://rest-rpc.dev/docs/client/fetch-client#call-routes}
 */
export type InferClientResponse<T extends RouteTree> = T extends {
	readonly "~restrpc": infer TRoute extends RouteDeclaration;
}
	? DeclaredClientResponse<TRoute>
	: {
			[K in keyof T]: T[K] extends RouteTree
				? InferClientResponse<T[K]>
				: never;
		};

/**
 * Infers the successful result of a route's client call.
 *
 * @remarks Includes the envelopes of 2xx responses. Pass a route tree to
 * infer a matching tree of results.
 *
 * @see {@link https://rest-rpc.dev/docs/client/fetch-client#type-helpers}
 */
export type InferClientSuccess<T extends RouteTree> = T extends {
	readonly "~restrpc": infer TRoute extends RouteDeclaration;
}
	? SuccessfulDeclaredClientResponse<TRoute>
	: {
			[K in keyof T]: T[K] extends RouteTree ? InferClientSuccess<T[K]> : never;
		};

/**
 * Infers the declared error responses a route's client call can return.
 *
 * @remarks Includes the envelopes of declared non-2xx responses. Thrown
 * `HttpError` and `Error` values are not included.
 * Pass a route tree to infer a matching tree of types.
 *
 * @see {@link https://rest-rpc.dev/docs/client/fetch-client#type-helpers}
 */
export type InferClientError<T extends RouteTree> = T extends {
	readonly "~restrpc": infer TRoute extends RouteDeclaration;
}
	? ErrorDeclaredClientResponse<TRoute>
	: {
			[K in keyof T]: T[K] extends RouteTree ? InferClientError<T[K]> : never;
		};

/**
 * Infers the `data` of each event received from a streaming route.
 *
 * @remarks Unwraps the `SseEvent` values of successful stream responses.
 * Routes without a stream response infer `never`. Pass a route tree to infer
 * a matching tree of event data types.
 *
 * @see {@link https://rest-rpc.dev/docs/client/fetch-client#type-helpers}
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

const assertResponseContentType = (
	declared: string | readonly string[] | undefined,
	rawResponse: Response,
	body: unknown,
) => {
	const received = normalizeMediaType(
		rawResponse.headers.get("content-type") ?? "",
	);
	if (!received || declared === undefined) return;
	if (findDeclaredContentType(declared, received) === undefined) {
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
	if (rawResponse.body === null) {
		throw new Error("Server returned no stream body");
	}
	return parseSseStream(schema, rawResponse.body, validate, rawResponse.status);
};

const readHeaders = async (
	schema: ResponseDeclaration | undefined,
	rawResponse: Response,
	validate: boolean,
	body: unknown,
) => {
	const headers = Object.fromEntries(rawResponse.headers.entries());
	if (!schema?.headers || !validate) return headers;

	const result = await validateStandardSchema(schema.headers, headers);
	if (result.issues)
		throw new HttpError(rawResponse.status, body, { cause: result.issues });
	// Keep headers the schema does not declare.
	return { ...headers, ...result.value };
};

const readBody = async (
	rawResponse: Response,
	mediaType: string,
	bodyCodecs: readonly BodyCodec[] | undefined,
) => {
	if (!mediaType || rawResponse.body === null) return undefined;
	const resolvedCodec = resolveBodyCodec(mediaType, [
		...(bodyCodecs ?? []),
		...defaultBodyCodecs,
	]);
	return resolvedCodec?.deserialize?.(rawResponse);
};

export type RouteRequestFn = <E extends RouteDeclaration & { path: string }>(
	route: E,
	...args: FetchArgs<E>
) => Promise<Response>;

/**
 * Reads a fetch response into a status envelope.
 *
 * @remarks `text/event-stream` responses are always parsed as SSE streams.
 * Routes without response declarations, such as extracted contracts, return
 * every status as an envelope. Routes with declarations reject undeclared
 * statuses and undeclared media types.
 */
export const fetchResponse = async <
	E extends RouteDeclaration & { path: string },
>(
	request: RouteRequestFn,
	validateResponse: boolean,
	bodyCodecs: readonly BodyCodec[] | undefined,
	route: E,
	...args: FetchArgs<E>
) => {
	const rawResponse = await request(route, ...args);
	const { status } = rawResponse;
	const schema: ResponseDeclaration | undefined = route.responses?.[status];
	const mediaType = normalizeMediaType(rawResponse.headers.get("content-type"));

	if (mediaType === STREAM_CONTENT_TYPE) {
		const body = readStreamResponse(
			schema?.body,
			rawResponse,
			validateResponse,
		);
		return {
			status,
			headers: await readHeaders(schema, rawResponse, validateResponse, body),
			body,
		};
	}
	if (schema?.kind === "stream") {
		throw new Error("Server returned an unsupported stream content-type.");
	}

	const value = await readBody(rawResponse, mediaType, bodyCodecs);
	const declaresResponses = Object.keys(route.responses ?? {}).length > 0;
	if (!schema && declaresResponses) {
		throw new HttpError(status, value);
	}
	if (schema) assertResponseContentType(schema.contentType, rawResponse, value);
	return {
		status,
		headers: await readHeaders(schema, rawResponse, validateResponse, value),
		body: await validateResponseValue(
			schema?.body,
			value,
			validateResponse,
			status,
		),
	};
};

export type SuccessfulResponseBody<TRoute extends RouteDeclaration> =
	SuccessfulDeclaredClientResponse<TRoute> extends infer TResponse
		? TResponse extends { body: infer TBody }
			? TBody
			: never
		: never;
