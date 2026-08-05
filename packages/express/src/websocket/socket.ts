import { validateStandardSchemaSync } from "@contract-first-api/core";
import type {
	InferRouteClientMessage,
	InferRouteServerMessage,
	WebSocketRouteDeclaration,
} from "@contract-first-api/core/contract";
import type WebSocket from "ws";

export type InferRouteServerMessageResult<E extends WebSocketRouteDeclaration> =
	| { success: true; data: InferRouteServerReceivedMessage<E> }
	| { success: false };

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
		callback: (result: InferRouteServerMessageResult<E>) => void,
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
	): InferRouteServerMessageResult<E> => {
		try {
			const result = validateStandardSchemaSync(
				route.messages.client,
				JSON.parse(String(data)),
			);
			if (result.issues) throw result.issues;

			return {
				success: true,
				data: result.value as InferRouteClientMessage<E>,
			};
		} catch {
			return { success: false };
		}
	};

	routeSocket.send = (message: InferRouteServerSendMessage<E>) => {
		rawSend(JSON.stringify(message));
	};

	routeSocket.onMessage = (callback) => {
		const onMessage = (data: WebSocket.RawData) => {
			void Promise.resolve()
				.then(() => callback(parseIncomingMessage(data)))
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
