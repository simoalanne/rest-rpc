import type { BodyCodec } from "@rest-rpc/core";
import { normalizeMediaType, resolveBodyCodec } from "@rest-rpc/core/codecs";
import type { HttpMethod, RouteDeclaration } from "@rest-rpc/core/contract";
import { toColonPath } from "@rest-rpc/core/contract";
import { createRequestSignal, nodeBodyCodecs } from "@rest-rpc/node/adapter";
import {
	type RuntimeImplementationTree,
	type HandleHttpRouteConfiguration,
	flattenRouteImplementations,
	assertRequestContentType,
	handleHttpRoute,
	RequestValidationError,
	ResponseValidationError,
	serializeHttpRouteResult,
} from "@rest-rpc/server";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { Readable } from "node:stream";

/**
 * Defines how an invalid request is handled through native Fastify arguments.
 *
 * @see {@link https://rest-rpc.dev/docs/server/fastify#error-handling}
 */
export type RequestValidationErrorHandler = (
	error: RequestValidationError,
	request: FastifyRequest,
	reply: FastifyReply,
) => unknown;

/**
 * Defines how an invalid handler response is handled through native Fastify arguments.
 *
 * @see {@link https://rest-rpc.dev/docs/server/fastify#error-handling}
 */
export type ResponseValidationErrorHandler = (
	error: ResponseValidationError,
	request: FastifyRequest,
	reply: FastifyReply,
) => unknown;

/**
 * Fastify pre-handler that also receives the matched rest-rpc route declaration.
 *
 * @see {@link https://rest-rpc.dev/docs/server/fastify#prehandler}
 */
export type ExtendedFastifyPreHandler = (
	req: FastifyRequest,
	reply: FastifyReply,
	route: RouteDeclaration,
) => unknown;

/**
 * Options for registering rest-rpc routes on a Fastify instance.
 *
 * @see {@link https://rest-rpc.dev/docs/server/fastify#options}
 */
export type RegisterRoutesOptions = {
	bodyCodecs?: readonly BodyCodec<FastifyRequest>[];
	requestValidationErrorHandler?: RequestValidationErrorHandler;
	responseValidationErrorHandler?: ResponseValidationErrorHandler;
	preHandler?: ExtendedFastifyPreHandler[];
} & HandleHttpRouteConfiguration;

/**
 * Registers HTTP route implementations on a Fastify instance.
 *
 * @see {@link https://rest-rpc.dev/docs/server/fastify}
 */
export function registerRoutes(
	app: FastifyInstance,
	implementations: RuntimeImplementationTree,
	options: RegisterRoutesOptions = {},
) {
	const {
		preHandler = [],
		bodyCodecs = [],
		requestValidationErrorHandler,
		responseValidationErrorHandler,
	} = options;

	for (const implementation of flattenRouteImplementations(implementations)) {
		const route = implementation.route;
		const method = route.method.toLowerCase() as Lowercase<HttpMethod>;

		app[method](
			toColonPath(route.path),
			{
				preHandler: preHandler.map((handler) => {
					return async (req: FastifyRequest, reply: FastifyReply) => {
						await handler(req, reply, route);
					};
				}),
			},
			async (req: FastifyRequest, reply: FastifyReply) => {
				const rejection = assertRequestContentType(
					route,
					req.headers["content-type"],
				);
				if (rejection) {
					return reply
						.status(rejection.status)
						.send({ message: rejection.message });
				}

				const signal = createRequestSignal(reply.raw);
				const codec = resolveBodyCodec(
					normalizeMediaType(req.headers["content-type"]),
					bodyCodecs,
				);
				// Without a matching codec the body comes from the framework's parser, which
				// owns size limits, so requestBodyLimit is not offered here.
				const body = codec?.deserialize
					? await codec.deserialize(req)
					: req.body;
				const result = await handleHttpRoute(implementation, {
					configuration: {
						disableRequestValidation: options.disableRequestValidation,
						disableResponseValidation: options.disableResponseValidation,
					},
					request: {
						body,
						query: new URL(req.raw.url ?? "/", "http://localhost").searchParams,
						params: req.params,
						headers: req.headers,
					},
					handlerFields: { req, reply, signal },
				});
				if (result instanceof RequestValidationError) {
					if (requestValidationErrorHandler) {
						return requestValidationErrorHandler(result, req, reply);
					}

					return reply.status(result.status).send(result.responseBody);
				}

				if (result instanceof ResponseValidationError) {
					if (responseValidationErrorHandler) {
						return responseValidationErrorHandler(result, req, reply);
					}

					return reply.status(result.status).send(result.responseBody);
				}

				const serialized = await serializeHttpRouteResult(
					result,
					bodyCodecs,
					nodeBodyCodecs,
				);
				for (const [name, value] of Object.entries(serialized.headers)) {
					if (value !== undefined) reply.header(name, value);
				}
				// Fastify owns stream errors: before headers are sent they reach its error
				// handler, afterwards the connection is destroyed.
				if (serialized.kind === "stream") {
					return reply
						.status(serialized.status)
						.type("text/event-stream")
						.send(Readable.from(serialized.body));
				}
				reply.status(serialized.status);
				if (!serialized.body) return reply.send();
				const { value, contentType } = serialized.body;
				if (contentType === null) reply.removeHeader("content-type");
				else reply.type(contentType);
				return reply.send(value);
			},
		);
	}
}
