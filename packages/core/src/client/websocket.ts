import type { RouteDeclaration } from "../contract/contract.ts";
import {
	type ClientReceived,
	validateWebSocketMessageSync,
	type WebSocketRouteDeclaration,
} from "../contract/websocketRouteBuilder.ts";
import type { ClientSocket } from "./types.ts";

export const buildWebSocketUrl = (url: string) => {
	if (url.startsWith("http:")) return url.replace("http:", "ws:");
	return url.replace("https:", "wss:");
};

export type WebSocketConnectionOptions = {
	validateIncomingMessages: boolean;
};

const adaptWebSocket = <E extends WebSocketRouteDeclaration>(
	route: E,
	rawSocket: WebSocket,
	validateIncomingMessages: boolean,
): ClientSocket<E> => {
	const parseIncomingMessage = (data: unknown): ClientReceived<E> => {
		try {
			if (!route.messages.server) {
				throw new Error("No server WebSocket messages are declared");
			}

			const value = JSON.parse(String(data));
			if (!validateIncomingMessages) {
				return value as ClientReceived<E>;
			}
			const result = validateWebSocketMessageSync(route.messages.server, value);
			if (result.issues) throw result.issues;

			return result.value as ClientReceived<E>;
		} catch {
			rawSocket.close(1007, "Invalid WebSocket message.");
			throw new Error("Invalid WebSocket message.");
		}
	};

	return {
		raw: rawSocket,
		get readyState() {
			return rawSocket.readyState;
		},
		get url() {
			return rawSocket.url;
		},
		close(code, reason) {
			rawSocket.close(code, reason);
		},
		send(message) {
			if (!route.messages.client) {
				throw new Error("No client WebSocket messages are declared");
			}

			if (rawSocket.readyState !== WebSocket.OPEN) {
				throw new Error("WebSocket is not open");
			}

			rawSocket.send(JSON.stringify(message));
		},
		onOpen(callback) {
			rawSocket.addEventListener("open", callback);
			return () => rawSocket.removeEventListener("open", callback);
		},
		onClose(callback) {
			rawSocket.addEventListener("close", callback);
			return () => rawSocket.removeEventListener("close", callback);
		},
		onError(callback) {
			rawSocket.addEventListener("error", callback);
			return () => rawSocket.removeEventListener("error", callback);
		},
		onMessage(callback) {
			if (!route.messages.server) return () => {};

			const onMessage = (event: MessageEvent) => {
				let message: ClientReceived<E>;
				try {
					message = parseIncomingMessage(event.data);
				} catch {
					return;
				}

				callback(message);
			};

			rawSocket.addEventListener("message", onMessage);
			return () => rawSocket.removeEventListener("message", onMessage);
		},
	};
};

export const openConnection = <E extends WebSocketRouteDeclaration>(
	route: E,
	options: WebSocketConnectionOptions,
	url: string,
): ClientSocket<E> => {
	if (typeof WebSocket === "undefined") {
		throw new Error("WebSocket is not available in this runtime");
	}

	const rawSocket = new WebSocket(buildWebSocketUrl(url));
	return adaptWebSocket(route, rawSocket, options.validateIncomingMessages);
};

export const assertWebSocketRoute = (
	route: RouteDeclaration,
): asserts route is WebSocketRouteDeclaration => {
	if (route.mode !== "webSocket") {
		throw new Error("Expected a websocket route");
	}
};
