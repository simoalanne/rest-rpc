import { Readable } from "node:stream";
import type { HttpMethod, HttpRouteDeclaration } from "@rest-rpc/core/contract";
import {
	handleHttpRoute,
	handleHttpRouteResult,
	type RouteImplementation,
	type ServerErrorHandlers,
} from "@rest-rpc/server";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

const toStream = (
	body: AsyncIterable<unknown>,
	mode: "ndjson" | "raw" = "ndjson",
) =>
	Readable.from(
		(async function* () {
			for await (const chunk of body) {
				yield mode === "ndjson" ? `${JSON.stringify(chunk)}\n` : chunk;
			}
		})(),
	);

export const registerFastifyHttpRoutes = (
	app: FastifyInstance,
	routes: RouteImplementation<HttpRouteDeclaration>[],
	errorHandlers?: ServerErrorHandlers<{ req: FastifyRequest }>,
) => {
	for (const implementation of routes) {
		const route: HttpRouteDeclaration = implementation.route;
		const method = route.method.toLowerCase() as Lowercase<HttpMethod>;
		const handler = implementation.handler;

		app[method](
			route.path,
			async (req: FastifyRequest, reply: FastifyReply) => {
				const result = await handleHttpRoute(route, handler, {
					request: {
						body: req.body,
						query: req.query,
						params: req.params,
						headers: req.headers,
					},
					context: { req },
					errorHandlers,
				});

				return handleHttpRouteResult(result, {
					setHeader: (name, value) => reply.header(name, value),
					sendEmpty: (status) => reply.status(status).send(),
					sendJson: (status, body) => reply.status(status).send(body),
					sendCustom: (status, body) => reply.status(status).send(body),
					sendStream: ({ body, status, contentType, mode }) =>
						reply.status(status).type(contentType).send(toStream(body, mode)),
				});
			},
		);
	}
};
