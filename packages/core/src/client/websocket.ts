import type {
	RouteDeclaration,
	WebSocketRouteDeclaration,
} from "../contract/contract.ts";
import type { ClientReceived } from "../contract/request.ts";
import { validateWebSocketMessageSync } from "../contract/websocketMessages.ts";
import { constructBaseRequest, takesRequestInput } from "./request.ts";
import type { ClientSocket, OpenConnectionArgs } from "./types.ts";

export const buildWebSocketUrl = (url: string) => {
	if (url.startsWith("http:")) return url.replace("http:", "ws:");
	return url.replace("https:", "wss:");
};

export type WebSocketConnectionOptions = {
	baseUrl: string;
	unknownRequestKeys: "throw" | "strip";
	validateIncomingMessages: boolean;
};

const adaptWebSocket = <E extends WebSocketRouteDeclaration>(
	route: E,
	rawSocket: WebSocket,
	validateIncomingMessages: boolean,
): ClientSocket<E> => {
	const parseIncomingMessage = (data: unknown): ClientReceived<E> => {
		try {
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
	...args: OpenConnectionArgs<E>
): ClientSocket<E> => {
	if (typeof WebSocket === "undefined") {
		throw new Error("WebSocket is not available in this runtime");
	}

	const requestArgs = takesRequestInput(route) ? args[0] : undefined;
	const { url } = constructBaseRequest(
		options.baseUrl,
		route,
		requestArgs,
		options.unknownRequestKeys,
	);
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
