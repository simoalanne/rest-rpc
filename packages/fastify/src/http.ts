import { Readable } from "node:stream";
import type {
	HttpMethod,
	HttpRouteDeclaration,
	RouteDeclaration,
} from "@rest-rpc/core/contract";
import { toColonPath } from "@rest-rpc/core/contract";
import {
	handleHttpRoute,
	handleHttpRouteResult,
	type HttpRouteResultStreamMode,
	type RouteImplementation,
	type ServerErrorHandlers,
	formatSseEvent,
	type SseEvent,
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

const toStream = (
	body: AsyncIterable<unknown>,
	mode: HttpRouteResultStreamMode = "ndjson",
) =>
	Readable.from(
		(async function* () {
			for await (const chunk of body) {
				if (mode === "ndjson") {
					yield `${JSON.stringify(chunk)}\n`;
					continue;
				}
				if (mode === "sse") {
					yield formatSseEvent(chunk as SseEvent<unknown>);
					continue;
				}
				yield chunk;
			}
		})(),
	);

const createRequestSignal = (req: FastifyRequest, reply: FastifyReply) => {
	const controller = new AbortController();
	const abort = () => controller.abort();
	req.raw.once("aborted", abort);
	reply.raw.once("close", () => {
		if (!reply.raw.writableFinished) abort();
	});
	return controller.signal;
};

export const registerFastifyHttpRoutes = (
	app: FastifyInstance,
	routes: RouteImplementation<HttpRouteDeclaration>[],
	preHandler: ExtendedFastifyPreHandler[] = [],
	errorHandlers?: ServerErrorHandlers<{
		req: FastifyRequest;
		signal: AbortSignal;
	}>,
) => {
	for (const implementation of routes) {
		const route: HttpRouteDeclaration = implementation.route;
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
				const signal = createRequestSignal(req, reply);
				const result = await handleHttpRoute(route, handler, {
					request: {
						body: req.body,
						query: req.query,
						pathParams: req.params,
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
						reply.status(status).type(contentType).send(toStream(body, mode)),
				});
			},
		);
	}
};
