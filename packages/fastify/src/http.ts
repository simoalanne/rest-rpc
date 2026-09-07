import type { HttpMethod, RouteDeclaration } from "@rest-rpc/core/contract";
import { toColonPath } from "@rest-rpc/core/contract";
import { createNodeResponseStream, createRequestSignal } from "@rest-rpc/node";
import {
	handleHttpRoute,
	handleHttpRouteResult,
	type RouteImplementation,
	type ServerErrorHandlers,
	type ServerHttpRouteDeclaration,
} from "@rest-rpc/server";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

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
	errorHandlers?: ServerErrorHandlers<{
		req: FastifyRequest;
		signal: AbortSignal;
	}>,
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
				const signal = createRequestSignal(req.raw, reply.raw);
				const result = await handleHttpRoute(route, handler, {
					request: {
						body: req.body,
						query: req.query,
						params: req.params,
						headers: req.headers,
					},
					context: { req, signal },
					errorHandlers,
				});

				return handleHttpRouteResult(result, {
					setHeader: (name, value) => reply.header(name, value),
					sendEmpty: (status) => reply.status(status).send(),
					sendJson: (status, body) => reply.status(status).send(body),
					sendCustom: (status, body) => reply.status(status).send(body),
					sendStream: ({ body, status, contentType, mode }) =>
						reply
							.status(status)
							.type(contentType)
							.send(createNodeResponseStream(body, mode)),
				});
			},
		);
	}
};
