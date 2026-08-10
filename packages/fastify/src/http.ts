import { Readable } from "node:stream";
import type { HttpMethod, HttpRouteDeclaration } from "@rest-rpc/core/contract";
import { handleHttpRoute, type RouteImplementation } from "@rest-rpc/server";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { FastifyApp } from "./types.ts";

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

const setHeaders = (
	reply: FastifyReply,
	headers: Record<string, string | number | readonly string[] | undefined>,
) => {
	for (const [name, value] of Object.entries(headers)) {
		if (value !== undefined) reply.header(name, value);
	}
};

export const registerFastifyHttpRoutes = (
	app: FastifyApp,
	routes: RouteImplementation<HttpRouteDeclaration>[],
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
				});

				if (result.headers) setHeaders(reply, result.headers);

				if (result.kind === "empty") {
					return reply.status(result.status).send();
				}

				if (result.kind === "stream") {
					return reply
						.status(result.status)
						.type(result.contentType ?? "application/x-ndjson")
						.send(toStream(result.body, result.contentType ? "raw" : "ndjson"));
				}

				if (result.kind === "custom") {
					return reply
						.status(result.status)
						.type(result.contentType)
						.send(result.body);
				}

				return reply.status(result.status).send(result.body);
			},
		);
	}
};
