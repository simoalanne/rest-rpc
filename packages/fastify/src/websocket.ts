import type { WebSocket as FastifyWebSocket } from "@fastify/websocket";
import type { WebSocketRouteDeclaration } from "@rest-rpc/core/contract";
import {
	type BeforeWebSocketUpgrade,
	handleWebSocketRoute,
	type RawWebSocket,
	type RouteImplementation,
	type UpgradeRejection,
	validateRequest,
} from "@rest-rpc/server";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

export type FastifyWebSocketOptions = {
	beforeUpgrade?: BeforeWebSocketUpgrade<{ req: FastifyRequest }>;
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
			implementation.route.path,
			{
				websocket: true,
				async preValidation(req: FastifyRequest, reply: FastifyReply) {
					const request = {
						query: req.query,
						params: req.params,
						headers: req.headers,
					};
					const requestValidation = validateRequest(
						implementation.route,
						request,
					);

					if (!requestValidation.success) {
						await sendUpgradeRejection(reply, requestValidation.response);
						return;
					}

					const rejection = await options.beforeUpgrade?.({
						route: implementation.route,
						request: requestValidation.data,
						context: { req },
					});

					if (rejection) {
						await sendUpgradeRejection(reply, rejection);
						return;
					}
					(req as ExtendedFastifyRequest)[validatedWebSocketRequest] =
						requestValidation.data;
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
