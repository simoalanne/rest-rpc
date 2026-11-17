import { RouteError } from "@rest-rpc/core";
import {
	createBodyCodecRegistry,
	normalizeMediaType,
	type BodyCodecRegistry,
	type IncomingBody,
} from "@rest-rpc/core/codecs";
import type {
	AbsolutePath,
	HttpMethod,
	RouteDefinition,
} from "@rest-rpc/core/contract";
import type { MaybePromise } from "@rest-rpc/core/utils";
import {
	assertPathParams,
	flattenRouteImplementations,
	parsePathParams,
	readAttachedPathParams,
	readPathParams,
	resolveImplementationPath,
	type PathParams,
	type RuntimeImplementation,
	type RuntimeImplementationTree,
} from "../routing/match.ts";
import {
	readRequestPathname,
	readRequestSearch,
} from "../routing/requestUrl.ts";
import type {
	CreateRouteHandlersOptions,
	HandleOptions,
} from "./handleOptions.ts";
import { deserializeRequestBody } from "./deserializeRequestBody.ts";
import {
	executeRoute,
	toHttpRouteResult,
	type HttpRouteResult,
	type RouteResult,
} from "./handleHttpRoute.ts";
import { resolveRequestMediaType } from "./requestContentType.ts";
import { resolveRouteError, toSentError } from "./resolveRouteError.ts";
import type { SerializedHttpResponse } from "./serializeHttpRouteResult.ts";
import { sseBodyCodec } from "./sse.ts";
import { prepareStaticResponse } from "./staticResponse.ts";
import { parseQuery, validateRequestHeaders } from "./validation.ts";

// Request headers schemas see the normalized media type, while the codec gets
// the full header. The headers are copied, since Node's are the request's own.
const withNormalizedContentType = (
	headers: Record<string, string | undefined>,
): Record<string, string | undefined> => {
	const contentType = headers["content-type"];
	return contentType === undefined
		? headers
		: { ...headers, "content-type": normalizeMediaType(contentType) };
};

/** Reads the parts of a runtime's request that routes use. */
export type RequestReader<TRequest> = {
	/** The request URL or target, with the query. */
	url: (request: TRequest) => string;
	contentType: (request: TRequest) => string;
	headers: (request: TRequest) => Record<string, string>;
	/** Throws when the body was already read, such as by a body parser. */
	body: (request: TRequest, contentType: string) => IncomingBody;
};

/**
 * Turns a route result into a runtime's response. It runs inside the
 * dispatch, so a request creates one promise.
 */
export type ResponseWriter<TTarget, TOut> = {
	result: (
		result: HttpRouteResult | Response,
		target: TTarget,
		codecs: BodyCodecRegistry,
	) => MaybePromise<TOut>;
};

/**
 * Runs a route for a request routed to it and responds with the writer. Route
 * errors reject with the error as it is sent, so interceptors observe it.
 */
export type Dispatch<TRequest, TTarget, TOut> = (
	implementation: RuntimeImplementation,
	pathParams: PathParams,
	request: TRequest,
	target: TTarget,
	signal: AbortSignal,
	options: HandleOptions<object> | undefined,
) => Promise<TOut>;

/** The error for a body read before the route, which would otherwise look malformed. */
export const bodyAlreadyRead = () =>
	new Error(
		"The request body was already read. Pass the parsed body as the `body` option.",
	);

const createDispatch = <TRequest extends object, TTarget, TOut>(
	options: CreateRouteHandlersOptions,
	codecs: BodyCodecRegistry,
	reader: RequestReader<TRequest>,
	writer: ResponseWriter<TTarget, TOut>,
): Dispatch<TRequest, TTarget, TOut> => {
	const { disableRequestValidation, disableResponseValidation, sse } = options;
	const rejectWith = async (
		implementation: RuntimeImplementation,
		error: RouteError,
	): Promise<never> => {
		throw toSentError(
			await resolveRouteError(
				implementation.route,
				error,
				disableResponseValidation ?? false,
			),
		);
	};

	return async (
		implementation,
		pathParams,
		request,
		target,
		signal,
		handleOptions,
	) => {
		const schemas = implementation.route.request;
		// The URL is only read for the params of dynamic path segments and a
		// defined query, and params a router attached to the request are used
		// as-is.
		let params: Record<string, string> | undefined;
		if (pathParams.params.length > 0) {
			params = handleOptions?.params
				? assertPathParams(pathParams, handleOptions.params)
				: (readAttachedPathParams(pathParams, request) ??
					readPathParams(pathParams, readRequestPathname(reader.url(request))));
		}

		let headers = schemas?.headers?.length
			? withNormalizedContentType(reader.headers(request))
			: undefined;
		let headersValidated = false;

		// Routes without a body schema ignore the request body and its content type.
		let body: unknown;
		if (schemas?.body) {
			const contentType = reader.contentType(request);
			const receivedMediaType = normalizeMediaType(contentType);
			// The validated headers state the content types the route accepts, so
			// they are validated before the body is decoded.
			let declared: unknown;
			if (disableRequestValidation) declared = receivedMediaType || undefined;
			else if (headers) {
				try {
					const validated = validateRequestHeaders(
						implementation.route,
						headers,
					);
					headers = (
						validated instanceof Promise ? await validated : validated
					) as Record<string, string | undefined>;
				} catch (error) {
					if (error instanceof RouteError) {
						return rejectWith(implementation, error);
					}
					throw error;
				}
				headersValidated = true;
				declared = headers["content-type"];
			}
			const mediaType = resolveRequestMediaType(declared, receivedMediaType);
			if (mediaType instanceof RouteError) {
				return rejectWith(implementation, mediaType);
			}

			if (handleOptions?.body !== undefined) {
				body = handleOptions.body;
			} else {
				const deserialized = await deserializeRequestBody(
					reader.body(request, contentType),
					receivedMediaType,
					contentType,
					codecs,
				);
				if (deserialized.rejection) {
					return rejectWith(implementation, deserialized.rejection);
				}
				body = deserialized.body;
			}
		}

		let result: RouteResult | Response;
		try {
			result = await executeRoute(implementation, {
				request: {
					params,
					query: schemas?.query?.length
						? parseQuery(readRequestSearch(reader.url(request)))
						: undefined,
					headers,
					body,
				},
				signal,
				headersValidated,
				context: handleOptions?.context,
				disableRequestValidation,
				disableResponseValidation,
			});
		} catch (error) {
			if (error instanceof RouteError) {
				return rejectWith(implementation, error);
			}
			throw error;
		}

		return writer.result(toHttpRouteResult(result, sse), target, codecs);
	};
};

/** A route of a compiled route tree, before a runtime makes a handler of it. */
export type CompiledRoute = {
	method: HttpMethod;
	path: string;
	/** The route's definition with its resolved path, for interceptors. */
	definition: RouteDefinition;
	implementation: RuntimeImplementation;
	pathParams: PathParams;
	/** The response of a route completed with `.static()`, or the `Response` it returned. */
	staticResponse?: SerializedHttpResponse | Response;
};

/**
 * Flattens a route tree, prepares static responses and creates the dispatch
 * shared by the handlers of a runtime.
 */
export const compileRouteTree = <TRequest extends object, TTarget, TOut>(
	implementations: RuntimeImplementationTree,
	options: CreateRouteHandlersOptions,
	reader: RequestReader<TRequest>,
	writer: ResponseWriter<TTarget, TOut>,
) => {
	const codecs = createBodyCodecRegistry([
		sseBodyCodec,
		...(options.bodyCodecs ?? []),
	]);
	const routes = flattenRouteImplementations(implementations).map(
		(implementation): CompiledRoute => {
			const path = resolveImplementationPath(implementation.route.path);
			return {
				method: implementation.route.method,
				path,
				definition: { ...implementation.route, path: path as AbsolutePath },
				implementation,
				pathParams: parsePathParams(path),
				staticResponse: implementation.isStatic
					? prepareStaticResponse(
							implementation,
							codecs,
							options.disableResponseValidation ?? false,
						)
					: undefined,
			};
		},
	);
	return {
		routes,
		dispatch: createDispatch(options, codecs, reader, writer),
		codecs,
	};
};
