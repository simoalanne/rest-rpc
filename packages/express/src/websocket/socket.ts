import { validateStandardSchemaSync } from "@contract-first-api/core";
import type {
	InferReceivedClientMessage,
	InferServerMessage,
	WebSocketRouteDeclaration,
} from "@contract-first-api/core/contract";
import type WebSocket from "ws";

export type InferRouteServerReceivedMessage<
	E extends WebSocketRouteDeclaration,
> = InferReceivedClientMessage<E>;

export type InferRouteServerSendMessage<E extends WebSocketRouteDeclaration> =
	InferServerMessage<E>;

export type InferRouteServerSocket<E extends WebSocketRouteDeclaration> = Omit<
	WebSocket,
	"send" | "on" | "off"
> & {
	send: (message: InferRouteServerSendMessage<E>) => void;
	onMessage: (
		callback: (message: InferRouteServerReceivedMessage<E>) => void,
	) => () => void;
	onClose: (callback: (code: number, reason: Buffer) => void) => () => void;
};

export const createRouteWebSocket = <E extends WebSocketRouteDeclaration>(
	socket: WebSocket,
	route: E,
): InferRouteServerSocket<E> => {
	const rawSend = socket.send.bind(socket);
	const routeSocket = socket as unknown as InferRouteServerSocket<E>;

	const parseIncomingMessage = (
		data: unknown,
	): InferReceivedClientMessage<E> => {
		try {
			const result = validateStandardSchemaSync(
				route.messages.client,
				JSON.parse(String(data)),
			);
			if (result.issues) throw result.issues;

			return result.value as InferReceivedClientMessage<E>;
		} catch {
			socket.close(1007, "Invalid WebSocket message.");
			throw new Error("Invalid WebSocket message.");
		}
	};

	routeSocket.send = (message: InferRouteServerSendMessage<E>) => {
		const result = validateStandardSchemaSync(route.messages.server, message);
		if (result.issues) throw result.issues;

		rawSend(JSON.stringify(result.value));
	};

	routeSocket.onMessage = (callback) => {
		const onMessage = (data: WebSocket.RawData) => {
			let message: InferReceivedClientMessage<E>;
			try {
				message = parseIncomingMessage(data);
			} catch {
				return;
			}

			void Promise.resolve()
				.then(() => callback(message))
				.catch(() => {
					socket.close(1011, "WebSocket message handler failed.");
				});
		};

		socket.on("message", onMessage);
		return () => socket.off("message", onMessage);
	};

	routeSocket.onClose = (callback) => {
		const onClose = (code: number, reason: Buffer) => {
			void Promise.resolve()
				.then(() => callback(code, reason))
				.catch(() => {});
		};

		socket.on("close", onClose);
		return () => socket.off("close", onClose);
	};

	return routeSocket;
};
