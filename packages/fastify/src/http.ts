import type { HttpMethod, RouteDeclaration } from "@rest-rpc/core/contract";
import { toColonPath } from "@rest-rpc/core/contract";
import { createNodeResponseStream, createRequestSignal } from "@rest-rpc/node";
import {
	handleHttpRoute,
	handleHttpRouteResult,
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

export const registerFastifyHttpRoutes = (
	app: FastifyInstance,
	routes: ReturnType<
		typeof import("@rest-rpc/server").flattenRouteImplementations
	>,
	preHandler: ExtendedFastifyPreHandler[] = [],
	requestValidationErrorHandler?: RequestValidationErrorHandler,
	responseValidationErrorHandler?: ResponseValidationErrorHandler,
) => {
	for (const implementation of routes) {
		const route = implementation.route;
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
					const result = await handleHttpRoute(
						route,
						handler as (request: unknown) => unknown,
						{
							request: {
								body: req.body,
								query: new URL(req.raw.url ?? "/", "http://localhost")
									.searchParams,
								params: req.params,
								headers: req.headers,
							},
							context: {},
							handlerFields: { req, reply, signal },
						},
					);

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
						sendStream: ({ body, status, contentType }) =>
							reply
								.status(status)
								.type(contentType)
								.send(createNodeResponseStream(body)),
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
