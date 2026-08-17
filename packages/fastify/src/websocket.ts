import type { WebSocket as FastifyWebSocket } from "@fastify/websocket";
import type { WebSocketRouteDeclaration } from "@rest-rpc/core/contract";
import { toColonPath } from "@rest-rpc/core/contract";
import {
	type BeforeWebSocketUpgrade,
	handleWebSocketRoute,
	prepareWebSocketUpgrade,
	type RawWebSocket,
	type RouteImplementation,
	type ServerErrorHandlers,
	type UpgradeRejection,
} from "@rest-rpc/server";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

export type FastifyWebSocketOptions = {
	beforeUpgrade?: BeforeWebSocketUpgrade<{
		req: FastifyRequest;
		signal: AbortSignal;
	}>;
	errorHandlers?: Pick<
		ServerErrorHandlers<{ req: FastifyRequest; signal: AbortSignal }>,
		"onRequestValidationError"
	>;
};

const adaptWebSocket = (socket: FastifyWebSocket): RawWebSocket => ({
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
) => {
	for (const implementation of routes) {
		app.get(
			toColonPath(implementation.route.path),
			{
				websocket: true,
				async preValidation(req: FastifyRequest, reply: FastifyReply) {
					const controller = new AbortController();
					const abort = () => controller.abort();
					req.raw.once("aborted", abort);
					reply.raw.once("close", () => {
						if (!reply.raw.writableFinished) abort();
					});
					const request = {
						query: req.query,
						pathParams: req.params,
						headers: req.headers,
					};
					const upgrade = await prepareWebSocketUpgrade({
						implementation,
						request,
						context: { req, signal: controller.signal },
						beforeUpgrade: options.beforeUpgrade,
						errorHandlers: options.errorHandlers,
					});

					if (!upgrade.ok) {
						await sendUpgradeRejection(reply, upgrade.rejection);
						return;
					}
					(req as ExtendedFastifyRequest)[validatedWebSocketRequest] =
						upgrade.request;
				},
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
