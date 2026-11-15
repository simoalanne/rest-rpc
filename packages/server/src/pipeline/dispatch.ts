import { RouteError } from "@rest-rpc/core";
import {
	createBodyCodecRegistry,
	normalizeMediaType,
	type BodyCodecRegistry,
	type IncomingBody,
} from "@rest-rpc/core/codecs";
import type { HttpMethod } from "@rest-rpc/core/contract";
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
import { observeError } from "./errors.ts";
import {
	executeRoute,
	toHttpRouteResult,
	type HttpRouteResult,
	type RouteResult,
} from "./handleHttpRoute.ts";
import { resolveRequestMediaType } from "./requestContentType.ts";
import { resolveRouteError } from "./resolveRouteError.ts";
import type { SerializedHttpResponse } from "./serializeHttpRouteResult.ts";
import { sseBodyCodec } from "./sse.ts";
import { prepareStaticResponse } from "./staticResponse.ts";
import { parseQuery } from "./validation.ts";

/** Reads the parts of a runtime's request that routes use. */
export type RequestReader<TRequest> = {
	/** The request URL or target, with the query. */
	url: (request: TRequest) => string;
	contentType: (request: TRequest) => string;
	headers: (request: TRequest) => Record<string, string>;
	/** Throws when the body was already read, such as by a body parser. */
	body: (request: TRequest, contentType: string) => IncomingBody;
};

/** A route result to serialize, or an error to send as an error response. */
export type DispatchResult = HttpRouteResult | RouteError;

/**
 * Turns a dispatch result into a runtime's response. It runs inside the
 * dispatch, so a request creates one promise.
 */
export type ResponseWriter<TTarget, TOut> = {
	result: (
		result: HttpRouteResult,
		target: TTarget,
		codecs: BodyCodecRegistry,
	) => MaybePromise<TOut>;
	error: (error: RouteError, target: TTarget) => MaybePromise<TOut>;
};

/** Runs a route for a request routed to it and responds with the writer. */
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
	options: CreateRouteHandlersOptions<TRequest>,
	codecs: BodyCodecRegistry,
	reader: RequestReader<TRequest>,
	writer: ResponseWriter<TTarget, TOut>,
): Dispatch<TRequest, TTarget, TOut> => {
	const { disableRequestValidation, disableResponseValidation, onError } =
		options;
	const toErrorResponse = async (
		implementation: RuntimeImplementation,
		error: RouteError,
		request: TRequest,
		target: TTarget,
	) => {
		const resolved = await resolveRouteError(
			implementation.route,
			error,
			disableResponseValidation ?? false,
		);
		observeError(onError, resolved, request);
		return writer.error(resolved, target);
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

		// Routes without a body schema ignore the request body and its content type.
		let body: unknown;
		let mediaType: string | undefined;
		if (schemas?.body) {
			const contentType = reader.contentType(request);
			const receivedMediaType = normalizeMediaType(contentType);
			const selected = resolveRequestMediaType(
				implementation,
				receivedMediaType,
			);
			if (selected instanceof RouteError) {
				return toErrorResponse(implementation, selected, request, target);
			}
			mediaType = selected;

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
					return toErrorResponse(
						implementation,
						deserialized.rejection,
						request,
						target,
					);
				}
				body = deserialized.body;
			}
		}

		let result: RouteResult;
		try {
			result = await executeRoute(implementation, {
				request: {
					params,
					query: schemas?.query?.length
						? parseQuery(readRequestSearch(reader.url(request)))
						: undefined,
					headers: schemas?.headers?.length
						? reader.headers(request)
						: undefined,
					body,
				},
				signal,
				mediaType,
				context: handleOptions?.context,
				disableRequestValidation,
				disableResponseValidation,
			});
		} catch (error) {
			if (error instanceof RouteError) {
				return toErrorResponse(implementation, error, request, target);
			}
			throw error;
		}

		return writer.result(
			toHttpRouteResult(
				result,
				onError && ((error) => observeError(onError, error, request)),
			),
			target,
			codecs,
		);
	};
};

/** A route of a compiled route tree, before a runtime makes a handler of it. */
export type CompiledRoute = {
	method: HttpMethod;
	path: string;
	implementation: RuntimeImplementation;
	pathParams: PathParams;
	/** The response of a route completed with `.static()`. */
	staticResponse?: SerializedHttpResponse;
};

/**
 * Flattens a route tree, prepares static responses and creates the dispatch
 * shared by the handlers of a runtime.
 */
export const compileRouteTree = <TRequest extends object, TTarget, TOut>(
	implementations: RuntimeImplementationTree,
	options: CreateRouteHandlersOptions<TRequest>,
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
