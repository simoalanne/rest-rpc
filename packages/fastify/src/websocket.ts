import type { WebSocket as FastifyWebSocket } from "@fastify/websocket";
import type { WebSocketRouteDeclaration } from "@rest-rpc/core/contract";
import { toColonPath } from "@rest-rpc/core/contract";
import {
	type BeforeWebSocketUpgrade,
	handleWebSocketRoute,
	prepareWebSocketUpgrade,
	type RouteImplementation,
	type ServerErrorHandlers,
	type UpgradeRejection,
	type WebSocketLike,
} from "@rest-rpc/server";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { ExtendedFastifyPreHandler } from "./http.ts";

export type FastifyWebSocketOptions = {
	beforeUpgrade?: BeforeWebSocketUpgrade<{
		req: FastifyRequest;
		signal: AbortSignal;
	}>;
};

const adaptWebSocket = (socket: FastifyWebSocket): WebSocketLike => ({
	send(data) {
		socket.send(data);
	},
	close(code, reason) {
		socket.close(code, reason);
	},
	onMessage(callback) {
		const onMessage = (data: unknown) => callback(data);
		socket.on("message", onMessage);
		return () => socket.off("message", onMessage);
	},
	onClose(callback) {
		const onClose = (code: number, reason: Buffer) =>
			callback({ code, reason: reason.toString() });
		socket.on("close", onClose);
		return () => socket.off("close", onClose);
	},
});

const sendUpgradeRejection = (
	reply: FastifyReply,
	rejection: UpgradeRejection,
) => {
	for (const [name, value] of Object.entries(rejection.headers ?? {})) {
		if (value !== undefined) reply.header(name, value);
	}
	return reply.status(rejection.status).send(rejection.body);
};

const validatedWebSocketRequest = Symbol("validatedWebSocketRequest");

type ExtendedFastifyRequest = FastifyRequest & {
	[validatedWebSocketRequest]: Record<string, unknown>;
};

export const registerFastifyWebSocketRoutes = (
	app: FastifyInstance,
	options: FastifyWebSocketOptions,
	routes: RouteImplementation<WebSocketRouteDeclaration>[],
	preHandler: ExtendedFastifyPreHandler[] = [],
	errorHandlers?: ServerErrorHandlers<{
		req: FastifyRequest;
		signal: AbortSignal;
	}>,
) => {
	for (const implementation of routes) {
		app.get(
			toColonPath(implementation.route.path),
			{
				websocket: true,
				preValidation: [
					...preHandler.map((handler) => {
						return async (req: FastifyRequest, reply: FastifyReply) => {
							await handler(req, reply, implementation.route);
						};
					}),
					async (req: FastifyRequest, reply: FastifyReply) => {
						const controller = new AbortController();
						const abort = () => controller.abort();
						req.raw.once("aborted", abort);
						reply.raw.once("close", () => {
							if (!reply.raw.writableFinished) abort();
						});
						const request = {
							query: req.query,
							params: req.params,
							headers: req.headers,
						};
						const upgrade = await prepareWebSocketUpgrade({
							implementation,
							request,
							context: { req, signal: controller.signal },
							beforeUpgrade: options.beforeUpgrade,
							errorHandlers,
						});

						if (!upgrade.ok) {
							await sendUpgradeRejection(reply, upgrade.rejection);
							return;
						}
						(req as ExtendedFastifyRequest)[validatedWebSocketRequest] =
							upgrade.request;
					},
				],
			},
			(socket: FastifyWebSocket, req: FastifyRequest) => {
				const validatedRequest = (req as ExtendedFastifyRequest)[
					validatedWebSocketRequest
				];

				handleWebSocketRoute(implementation.route, implementation.handler, {
					request: validatedRequest,
					context: { req },
					socket: adaptWebSocket(socket),
				});
			},
		);
	}
};
