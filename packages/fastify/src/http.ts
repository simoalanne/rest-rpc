import type { HttpMethod, RouteDeclaration } from "@rest-rpc/core/contract";
import { toColonPath } from "@rest-rpc/core/contract";
import { createNodeResponseStream, createRequestSignal } from "@rest-rpc/node";
import {
	handleHttpRoute,
	handleHttpRouteResult,
	RequestValidationError,
	ResponseValidationError,
	type RouteImplementation,
	type ServerHttpRouteDeclaration,
} from "@rest-rpc/server";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

/** Handles an HTTP request validation error using native Fastify arguments. */
export type RequestValidationErrorHandler = (
	error: RequestValidationError,
	request: FastifyRequest,
	reply: FastifyReply,
) => unknown;

/** Handles an HTTP response validation error using native Fastify arguments. */
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

export const registerFastifyHttpRoutes = (
	app: FastifyInstance,
	routes: RouteImplementation<ServerHttpRouteDeclaration>[],
	preHandler: ExtendedFastifyPreHandler[] = [],
	requestValidationErrorHandler?: RequestValidationErrorHandler,
	responseValidationErrorHandler?: ResponseValidationErrorHandler,
) => {
	for (const implementation of routes) {
		const route: ServerHttpRouteDeclaration = implementation.route;
		const method = route.method.toLowerCase() as Lowercase<HttpMethod>;
		const handler = implementation.handler;

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
				try {
					const signal = createRequestSignal(req.raw, reply.raw);
					const result = await handleHttpRoute(route, handler, {
						request: {
							body: req.body,
							query: req.query,
							params: req.params,
							headers: req.headers,
						},
						context: { req, signal },
					});

					return handleHttpRouteResult(result, {
						setHeader: (name, value) => reply.header(name, value),
						sendEmpty: (status) => reply.status(status).send(),
						sendJson: (status, body) => reply.status(status).send(body),
						sendCustom: (status, body) =>
							reply
								.status(status)
								.send(
									body instanceof Uint8Array ? Buffer.from(body) : String(body),
								),
						sendStream: ({ body, status, contentType, mode }) =>
							reply
								.status(status)
								.type(contentType)
								.send(createNodeResponseStream(body, mode)),
					});
				} catch (error) {
					if (error instanceof RequestValidationError) {
						if (requestValidationErrorHandler) {
							return requestValidationErrorHandler(error, req, reply);
						}

						return reply.status(400).send({
							message:
								"Request validation failed. Check the validationErrors field for details.",
							validationErrors: error.issues,
						});
					}

					if (error instanceof ResponseValidationError) {
						if (responseValidationErrorHandler) {
							return responseValidationErrorHandler(error, req, reply);
						}

						return reply.status(500).send({
							message: "Response validation failed.",
						});
					}

					throw error;
				}
			},
		);
	}
};
