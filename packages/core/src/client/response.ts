import {
	createBodyCodecRegistry,
	normalizeMediaType,
	type BodyCodecRegistry,
} from "../codecs/index.ts";
import type { Contract } from "../contract/contract.ts";
import type { RouteDefinition } from "../contract/routeDefinition.ts";
import type { SseEvent, SseFormat } from "../contract/sse.ts";
import type {
	ClientRouteError,
	ResponseDefinition,
	DefinedClientResponse,
} from "../contract/response.ts";
import {
	markDefined,
	RouteError,
	type RouteErrorDefinition,
} from "../contract/routeError.ts";
import {
	validateStandardSchema,
	type StandardSchemaV1,
} from "../standard-schema/index.ts";
import { parseSseStream } from "./stream.ts";
import {
	contractError,
	contractMismatch,
	validateResponseValue,
} from "./validateResponse.ts";

type ClientRouteFunction = (...args: never[]) => Promise<unknown>;

// A route, a client route function, or a tree of either.
export type ClientTypeSource =
	| Contract
	| ClientRouteFunction
	| { readonly [key: string]: ClientTypeSource };

// Drops the plain `Error` a call also rejects with. `RouteError` extends
// `Error`, so `Exclude<TError, Error>` would drop the defined errors too.
type DefinedErrorsOf<TError> = TError extends unknown
	? Error extends TError
		? never
		: TError
	: never;

/**
 * Infers a route's client result.
 *
 * @remarks Every route resolves with status-discriminated envelopes of its
 * successful responses. Pass a client route function, such as
 * `typeof client.users.get`, or a route. Pass a client or route tree to infer
 * a matching tree of results.
 *
 * @see {@link https://rest-rpc.vercel.app/docs/client/fetch-client#type-helpers}
 * @see {@link https://rest-rpc.vercel.app/docs/client/fetch-client#call-routes}
 */
export type InferClientResponse<T extends ClientTypeSource> =
	T extends ClientRouteFunction
		? Awaited<ReturnType<T>>
		: T extends { readonly "~restrpc": infer TRoute extends RouteDefinition }
			? DefinedClientResponse<TRoute>
			: {
					[K in keyof T]: T[K] extends ClientTypeSource
						? InferClientResponse<T[K]>
						: never;
				};

/**
 * Infers the `RouteError`s a route defines, which its client call rejects
 * with.
 *
 * @remarks Calls also reject with other `Error`s, such as when no response
 * arrived or it does not match the route contract. Pass a client route
 * function or a route. Pass a client or route tree to infer a matching tree of
 * types.
 *
 * @see {@link https://rest-rpc.vercel.app/docs/client/fetch-client#typesafe-error-handling}
 */
export type InferClientError<T extends ClientTypeSource> =
	T extends ClientRouteFunction
		? ReturnType<T> extends { readonly "~error"?: infer TError }
			? DefinedErrorsOf<Exclude<TError, undefined>>
			: never
		: T extends { readonly "~restrpc": infer TRoute extends RouteDefinition }
			? ClientRouteError<TRoute>
			: {
					[K in keyof T]: T[K] extends ClientTypeSource
						? InferClientError<T[K]>
						: never;
				};

// The defined errors of a route, or the union of those of every route in a
// tree, for `isDefinedError()`.
export type DefinedErrorIn<T extends ClientTypeSource> = T extends
	| ClientRouteFunction
	| { readonly "~restrpc": RouteDefinition }
	? InferClientError<T>
	: {
			[K in keyof T]: T[K] extends ClientTypeSource
				? DefinedErrorIn<T[K]>
				: never;
		}[keyof T];

/**
 * Infers the `data` of each event received from a streaming route.
 *
 * @remarks Unwraps the `SseEvent` values of stream responses. Routes without
 * a stream response infer `never`. Pass a client route function or a route.
 * Pass a client or route tree to infer a matching tree of event data types.
 *
 * @see {@link https://rest-rpc.vercel.app/docs/client/fetch-client#type-helpers}
 * @see {@link https://rest-rpc.vercel.app/docs/client/fetch-client#consume-streams}
 */
export type InferClientStreamData<T extends ClientTypeSource> =
	T extends ClientRouteFunction
		? StreamDataOf<Awaited<ReturnType<T>>>
		: T extends { readonly "~restrpc": infer TRoute extends RouteDefinition }
			? StreamDataOf<DefinedClientResponse<TRoute>>
			: {
					[K in keyof T]: T[K] extends ClientTypeSource
						? InferClientStreamData<T[K]>
						: never;
				};

type StreamDataOf<TResponse> = TResponse extends {
	body: AsyncIterable<SseEvent<infer TData>>;
}
	? TData
	: never;

const STREAM_CONTENT_TYPE = "text/event-stream";

// Joined `Set-Cookie` values cannot be split again, so they are read as
// `cookies` instead of a header.
const readHeaderRecord = (rawResponse: Response) =>
	Object.fromEntries(
		[...rawResponse.headers].filter(([name]) => name !== "set-cookie"),
	);

const readHeaders = async (
	schema: ResponseDefinition | RouteErrorDefinition | undefined,
	rawResponse: Response,
	validate: boolean,
) => {
	const headers = readHeaderRecord(rawResponse);
	const cookies = rawResponse.headers.getSetCookie();
	if (!schema?.headers || !validate) return { headers, cookies };

	const result = await validateStandardSchema(schema.headers, headers);
	if (result.issues) {
		throw contractError(contractMismatch, result.issues);
	}
	// Keep headers the schema does not define.
	return { headers: { ...headers, ...result.value }, cookies };
};

const readBody = async (
	rawResponse: Response,
	mediaType: string,
	codecs: BodyCodecRegistry,
) => {
	if (!mediaType || rawResponse.body === null) return undefined;
	try {
		return await codecs.deserialize(
			rawResponse,
			mediaType,
			readHeaderRecord(rawResponse),
		);
	} catch (cause) {
		throw contractError("Response body could not be decoded.", cause);
	}
};

const readValidated = async (
	schema: StandardSchemaV1 | undefined,
	value: unknown,
	validate: boolean,
) => {
	const result = await validateResponseValue(schema, value, validate);
	if (result.issues) {
		throw contractError(contractMismatch, result.issues);
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

// Errors are always JSON and can't be customized with codecs, so custom codecs
// never read them.
const defaultCodecs = createBodyCodecRegistry([]);

/**
 * Reads a non-2xx response into a `RouteError` when its body has a `code`, and
 * otherwise into an `Error` whose `cause` holds the received response.
 * A code the route defines is marked as defined after its status, `data` and
 * headers are checked; one that breaks the definition becomes an `Error`, like
 * bodies without a code.
 */
const readErrorResponse = async (
	rawResponse: Response,
	mediaType: string,
	route: RouteDefinition,
	validate: boolean,
): Promise<Error> => {
	const { status } = rawResponse;
	const body = await readBody(rawResponse, mediaType, defaultCodecs);
	const code = readCode(body);
	if (code === undefined) {
		// The cause mirrors the envelope of a successful response.
		return new Error(`Request failed with status ${status}.`, {
			cause: {
				status,
				...(await readHeaders(undefined, rawResponse, false)),
				body,
			},
		});
	}

	const { message, data } = body as { message?: unknown; data?: unknown };
	const options = {
		status,
		message: typeof message === "string" ? message : code,
	};
	const definition =
		route.errors && Object.hasOwn(route.errors, code)
			? route.errors[code]
			: undefined;
	if (!definition) {
		return new RouteError(code, {
			...options,
			...(await readHeaders(undefined, rawResponse, false)),
			data,
		});
	}
	if (definition.status !== status) return contractError(contractMismatch);

	const [validatedData, received] = await Promise.all([
		readValidated(definition.data, data, validate),
		readHeaders(definition, rawResponse, validate),
	]);
	return markDefined(
		new RouteError(code, { ...options, ...received, data: validatedData }),
	);
};

/** Rejects with a `RouteError` for error responses with a `code`, and an `Error` for other responses outside the route contract. */
export const readResponse = async <E extends RouteDefinition>(
	rawResponse: Response,
	route: E,
	validateResponse: boolean,
	codecs: BodyCodecRegistry,
	sseFormat?: SseFormat,
) => {
	const { status } = rawResponse;
	const mediaType = normalizeMediaType(rawResponse.headers.get("content-type"));

	if (!rawResponse.ok) {
		throw await readErrorResponse(
			rawResponse,
			mediaType,
			route,
			validateResponse,
		);
	}

	// A status must be defined, and a stream must be received for an `sse`
	// response and only for one. A declared `content-type` is checked with the
	// other response headers.
	const schema: ResponseDefinition | undefined = route.responses[status];
	const isStream = mediaType === STREAM_CONTENT_TYPE;
	const breaksContract = schema
		? isStream
			? "body" in schema && !("sse" in schema)
			: "sse" in schema && !("body" in schema)
		: Object.keys(route.responses).length > 0;
	if (isStream) {
		// A stream may never end, so it is cancelled instead of read.
		if (breaksContract) {
			rawResponse.body?.cancel().catch(() => {});
			throw contractError(contractMismatch);
		}
		if (rawResponse.body === null) {
			throw contractError("Server returned no stream body.");
		}
		const body = parseSseStream(
			schema?.sse,
			rawResponse as Response & {
				body: ReadableStream<Uint8Array<ArrayBuffer>>;
			},
			validateResponse,
			sseFormat,
		);
		return {
			status,
			...(await readHeaders(schema, rawResponse, validateResponse)),
			body,
		};
	}

	const value = await readBody(rawResponse, mediaType, codecs);
	if (breaksContract) {
		throw contractError(contractMismatch);
	}
	return {
		status,
		...(await readHeaders(schema, rawResponse, validateResponse)),
		body: await readValidated(schema?.body, value, validateResponse),
	};
};
