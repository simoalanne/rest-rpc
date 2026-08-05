import { validateStandardSchemaSync } from "@contract-first-api/core";
import type {
	InferRouteClientMessage,
	InferRouteServerMessage,
	WebSocketRouteDeclaration,
} from "@contract-first-api/core/contract";
import type WebSocket from "ws";

export type InferRouteServerReceivedMessage<
	E extends WebSocketRouteDeclaration,
> = InferRouteClientMessage<E>;

export type InferRouteServerSendMessage<E extends WebSocketRouteDeclaration> =
	InferRouteServerMessage<E>;

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

type RuntimeValidation = "incoming" | "incoming-and-outgoing";

export type RouteWebSocketOptions = {
	validation: RuntimeValidation;
};

export const createRouteWebSocket = <E extends WebSocketRouteDeclaration>(
	socket: WebSocket,
	route: E,
	options: RouteWebSocketOptions,
): InferRouteServerSocket<E> => {
	const rawSend = socket.send.bind(socket);
	const routeSocket = socket as unknown as InferRouteServerSocket<E>;

	const parseIncomingMessage = (data: unknown): InferRouteClientMessage<E> => {
		try {
			const result = validateStandardSchemaSync(
				route.messages.client,
				JSON.parse(String(data)),
			);
			if (result.issues) throw result.issues;

			return result.value as InferRouteClientMessage<E>;
		} catch {
			socket.close(1007, "Invalid WebSocket message.");
			throw new Error("Invalid WebSocket message.");
		}
	};

	routeSocket.send = (message: InferRouteServerSendMessage<E>) => {
		if (options.validation === "incoming-and-outgoing") {
			const result = validateStandardSchemaSync(route.messages.server, message);
			if (result.issues) throw result.issues;
		}

		rawSend(JSON.stringify(message));
	};

	routeSocket.onMessage = (callback) => {
		const onMessage = (data: WebSocket.RawData) => {
			let message: InferRouteClientMessage<E>;
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
