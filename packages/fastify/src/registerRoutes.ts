import type { BodyCodec, SerializedBody } from "@rest-rpc/core";
import { normalizeMediaType, resolveBodyCodec } from "@rest-rpc/core/codecs";
import type { HttpMethod, RouteDeclaration } from "@rest-rpc/core/contract";
import { toColonPath } from "@rest-rpc/core/contract";
import {
	createNodeResponseStream,
	createRequestSignal,
	nodeBodyCodecs,
} from "@rest-rpc/node";
import {
	type RuntimeImplementationTree,
	flattenRouteImplementations,
	assertRequestContentType,
	handleHttpRoute,
	RequestValidationError,
	ResponseValidationError,
} from "@rest-rpc/server";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

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
};

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

				const signal = createRequestSignal(req.raw, reply.raw);
				const codec = resolveBodyCodec(
					normalizeMediaType(req.headers["content-type"]),
					bodyCodecs,
				);
				const body = codec?.deserialize
					? await codec.deserialize(req)
					: req.body;
				const result = await handleHttpRoute(implementation, {
					request: {
						body,
						query: new URL(req.raw.url ?? "/", "http://localhost").searchParams,
						params: req.params,
						headers: req.headers,
					},
					context: {},
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

				let serialized: SerializedBody | undefined;
				if (result.kind === "response" && result.body) {
					const { value, contentType } = result.body;
					const codec = resolveBodyCodec(normalizeMediaType(contentType), [
						...bodyCodecs,
						...nodeBodyCodecs,
					]);
					serialized = await codec!.serialize!(value, contentType);
					for (const [name, value] of Object.entries(
						serialized.headers ?? {},
					)) {
						if (value !== undefined) reply.header(name, value);
					}
				}
				for (const [name, value] of Object.entries(result.headers ?? {})) {
					if (value !== undefined) reply.header(name, value);
				}
				if (result.kind === "stream") {
					return reply
						.status(result.status)
						.type("application/x-ndjson")
						.send(createNodeResponseStream(result.body));
				}
				reply.status(result.status);
				if (!serialized) return reply.send();
				const contentType =
					serialized.contentType === undefined
						? result.body!.contentType
						: serialized.contentType;
				if (contentType === null) reply.removeHeader("content-type");
				else reply.type(contentType);
				return reply.send(serialized.body);
			},
		);
	}
}
