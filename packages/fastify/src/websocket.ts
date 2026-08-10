import type { WebSocket as FastifyWebSocket } from "@fastify/websocket";
import type { WebSocketRouteDeclaration } from "@rest-rpc/core/contract";
import {
	handleWebSocketRoute,
	type RawWebSocket,
	type RouteImplementation,
	type UpgradeRejection,
	validateRequest,
} from "@rest-rpc/server";
import type { FastifyReply, FastifyRequest } from "fastify";
import type {
	FastifyApp,
	FastifyWebSocketOptions,
	FastifyWebSocketRegistration,
} from "./types.ts";

export const fastifyWebSocket = (
	options: FastifyWebSocketOptions = {},
): FastifyWebSocketRegistration => ({
	options,
});

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

export const registerFastifyWebSocketRoutes = (
	app: FastifyApp,
	registration: FastifyWebSocketRegistration,
	routes: RouteImplementation<WebSocketRouteDeclaration>[],
) => {
	for (const implementation of routes) {
		app.route({
			method: "GET",
			url: implementation.route.path,
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

				const rejection = await registration.options.beforeUpgrade?.({
					req,
					route: implementation.route,
					request,
				});

				if (rejection) {
					await sendUpgradeRejection(reply, rejection);
				}
			},
			handler(_req: FastifyRequest, reply: FastifyReply) {
				return reply.status(426).send({
					message: "Expected WebSocket upgrade.",
				});
			},
			wsHandler(socket: FastifyWebSocket, req: FastifyRequest) {
				const request = {
					query: req.query,
					params: req.params,
					headers: req.headers,
				};
				const result = handleWebSocketRoute(
					implementation.route,
					implementation.handler,
					{
						request,
						context: { req },
						socket: adaptWebSocket(socket),
					},
				);

				if (!result.ok) {
					socket.close(1008, "WebSocket upgrade validation failed.");
				}
			},
		});
	}
};
