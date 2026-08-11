import { REQUEST_CONTEXT_KEY } from "@rest-rpc/core/contract";
import {
	type ImplementationShape,
	router,
	type WebSocketRouteHandlerContext,
} from "@rest-rpc/server";
import { type WebSocketContract, websocketContract } from "./contract.ts";

export type WebSocketHandlers = ImplementationShape<
	WebSocketContract,
	WebSocketRouteHandlerContext,
	WebSocketRouteHandlerContext
>;

export const createWebSocketHandlers = (
	adapter: string,
): WebSocketHandlers => ({
	room: (request) => {
		const socket = request[REQUEST_CONTEXT_KEY].socket;

		socket.send({
			type: "welcome",
			roomId: request.roomId,
			mode: request.mode,
			adapter,
		});

		socket.onMessage(async (message) => {
			if (message.action === "fail") {
				throw new Error("boom from websocket message handler");
			}

			if (message.action === "close") {
				socket.close(4000, "closed by integration handler");
				return;
			}

			socket.send({
				type: "echo",
				text: message.text,
				roomId: request.roomId,
				mode: request.mode,
			});
		});
	},
});

export const createWebSocketImplementations = (adapter: string) =>
	router(websocketContract, createWebSocketHandlers(adapter));
