import { normalizeMediaType, type BodyCodecRegistry } from "../codecs/index.ts";
import type { RouteDeclaration, RouteTree } from "../contract/contract.ts";
import type { SseEvent } from "../contract/sse.ts";
import type {
	ClientRouteError,
	ResponseDeclaration,
	DeclaredClientResponse,
} from "../contract/response.ts";
import {
	RouteError,
	type RouteErrorDeclaration,
} from "../contract/routeError.ts";
import {
	validateStandardSchema,
	type StandardSchemaV1,
} from "../standard-schema/index.ts";
import { parseSseStream } from "./stream.ts";
import {
	contractMismatch,
	unknownError,
	validateResponseValue,
} from "./validateResponse.ts";
import type { FetchArgs } from "./request.ts";

/**
 * Infers a route's client result.
 *
 * @remarks Every route resolves with status-discriminated envelopes of its
 * successful responses. Pass a route tree to infer a matching tree of results.
 *
 * @see {@link https://rest-rpc.vercel.app/docs/client/fetch-client#type-helpers}
 * @see {@link https://rest-rpc.vercel.app/docs/client/fetch-client#call-routes}
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
 * Infers the `RouteError`s a route's client call rejects with when a response
 * arrived.
 *
 * @remarks Includes the route's declared errors and `UNKNOWN_ERROR`. Calls
 * also reject with other `Error`s when no response arrived. Pass a route tree
 * to infer a matching tree of types.
 *
 * @see {@link https://rest-rpc.vercel.app/docs/client/fetch-client#handle-errors}
 */
export type InferClientError<T extends RouteTree> = T extends {
	readonly "~restrpc": infer TRoute extends RouteDeclaration;
}
	? ClientRouteError<TRoute>
	: {
			[K in keyof T]: T[K] extends RouteTree ? InferClientError<T[K]> : never;
		};

/**
 * Infers the `data` of each event received from a streaming route.
 *
 * @remarks Unwraps the `SseEvent` values of stream responses. Routes without
 * a stream response infer `never`. Pass a route tree to infer a matching tree
 * of event data types.
 *
 * @see {@link https://rest-rpc.vercel.app/docs/client/fetch-client#type-helpers}
 * @see {@link https://rest-rpc.vercel.app/docs/client/fetch-client#consume-streams}
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
	DeclaredClientResponse<E> extends infer TResponse
		? TResponse extends { body: AsyncIterable<SseEvent<infer TData>> }
			? TData
			: never
		: never;

const STREAM_CONTENT_TYPE = "text/event-stream";

const readHeaders = async (
	schema: ResponseDeclaration | RouteErrorDeclaration | undefined,
	rawResponse: Response,
	validate: boolean,
	body: unknown,
) => {
	const headers = Object.fromEntries(rawResponse.headers.entries());
	if (!schema?.headers || !validate) return headers;

	const result = await validateStandardSchema(schema.headers, headers);
	if (result.issues) {
		throw unknownError(rawResponse, body, contractMismatch, result.issues);
	}
	// Keep headers the schema does not declare.
	return { ...headers, ...result.value };
};

// The body is read before it is decoded, so failures of reading it stay
// transport failures, while bodies that cannot be decoded are part of the
// response.
const readBody = async (
	rawResponse: Response,
	mediaType: string,
	codecs: BodyCodecRegistry,
) => {
	if (!mediaType || rawResponse.body === null) return undefined;
	const bytes = await rawResponse.arrayBuffer();
	try {
		return await codecs.deserialize(
			new Response(bytes, { headers: rawResponse.headers }),
			mediaType,
		);
	} catch (cause) {
		throw unknownError(
			rawResponse,
			undefined,
			"Response body could not be decoded.",
			cause,
		);
	}
};

const readValidated = async (
	rawResponse: Response,
	schema: StandardSchemaV1 | undefined,
	value: unknown,
	validate: boolean,
	body: unknown,
) => {
	const result = await validateResponseValue(schema, value, validate);
	if (result.issues) {
		throw unknownError(rawResponse, body, contractMismatch, result.issues);
	}
	return result.value;
};

const readCode = (body: unknown) =>
	typeof body === "object" &&
	body !== null &&
	"code" in body &&
	typeof body.code === "string"
		? body.code
		: undefined;

/**
 * Reads a non-2xx response into a `RouteError`. Only a code the route
 * declares with the received status is recognized; everything else becomes
 * `UNKNOWN_ERROR`.
 */
const readErrorResponse = async (
	rawResponse: Response,
	mediaType: string,
	route: RouteDeclaration,
	validate: boolean,
	codecs: BodyCodecRegistry,
): Promise<RouteError> => {
	const { status } = rawResponse;
	const body = await readBody(rawResponse, mediaType, codecs);
	const code = readCode(body);
	const declaration =
		code !== undefined && route.errors && Object.hasOwn(route.errors, code)
			? route.errors[code]
			: undefined;
	if (!declaration || declaration.status !== status) {
		return unknownError(
			rawResponse,
			body,
			`Request failed with status ${status}.`,
		);
	}

	const { message, data } = body as { message?: unknown; data?: unknown };
	const [validatedData, headers] = await Promise.all([
		readValidated(rawResponse, declaration.data, data, validate, body),
		readHeaders(declaration, rawResponse, validate, body),
	]);
	return new RouteError(code!, {
		status,
		message: typeof message === "string" ? message : code,
		data: validatedData,
		headers,
	});
};

export type RouteRequestFn = <E extends RouteDeclaration & { path: string }>(
	route: E,
	...args: FetchArgs<E>
) => Promise<Response>;

/**
 * Reads a fetch response into a status envelope, or rejects with a
 * `RouteError` for error responses and responses outside the route contract.
 *
 * @remarks `text/event-stream` responses are always parsed as SSE streams.
 * Routes without response declarations, such as extracted contracts, accept
 * every 2xx status. Routes with declarations reject undeclared statuses and
 * undeclared media types. `contentType` is the received base media type, or
 * `undefined` without a content type.
 */
export const fetchResponse = async <
	E extends RouteDeclaration & { path: string },
>(
	request: RouteRequestFn,
	validateResponse: boolean,
	codecs: BodyCodecRegistry,
	route: E,
	...args: FetchArgs<E>
) => {
	const rawResponse = await request(route, ...args);
	const { status } = rawResponse;
	const mediaType = normalizeMediaType(rawResponse.headers.get("content-type"));
	const contentType = mediaType || undefined;

	if (!rawResponse.ok) {
		throw await readErrorResponse(
			rawResponse,
			mediaType,
			route,
			validateResponse,
			codecs,
		);
	}

	const schema: ResponseDeclaration | undefined = route.responses?.[status];
	if (mediaType === STREAM_CONTENT_TYPE) {
		if (rawResponse.body === null) {
			throw unknownError(
				rawResponse,
				undefined,
				"Server returned no stream body.",
			);
		}
		const body = parseSseStream(
			schema?.content?.[STREAM_CONTENT_TYPE],
			rawResponse as Response & {
				body: ReadableStream<Uint8Array<ArrayBuffer>>;
			},
			validateResponse,
		);
		return {
			status,
			contentType,
			headers: await readHeaders(schema, rawResponse, validateResponse, body),
			body,
		};
	}

	const value = await readBody(rawResponse, mediaType, codecs);
	const declaresResponses = Object.keys(route.responses ?? {}).length > 0;
	if (
		(!schema && declaresResponses) ||
		(mediaType && schema?.content && !(mediaType in schema.content))
	) {
		throw unknownError(rawResponse, value, contractMismatch);
	}
	return {
		status,
		contentType,
		headers: await readHeaders(schema, rawResponse, validateResponse, value),
		body: await readValidated(
			rawResponse,
			schema?.content?.[mediaType],
			value,
			validateResponse,
			value,
		),
	};
};

export type ClientResponseBody<TRoute extends RouteDeclaration> =
	DeclaredClientResponse<TRoute> extends infer TResponse
		? TResponse extends { body: infer TBody }
			? TBody
			: never
		: never;
