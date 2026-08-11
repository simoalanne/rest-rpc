import type {
	ClientReceived,
	ClientSent,
	RouteDeclaration,
	WebSocketRouteDeclaration,
} from "../contract/route.ts";
import { validateStandardSchemaSync } from "../standard-schema/index.ts";
import { constructBaseRequest, takesRequestInput } from "./request.ts";
import type { ClientSocket, OpenConnectionArgs, RuntimeArgs } from "./types.ts";

export const buildWebSocketUrl = (url: string) => {
	if (url.startsWith("http:")) return url.replace("http:", "ws:");
	return url.replace("https:", "wss:");
};

export type WebSocketConnectionOptions = {
	origin: string;
	unknownRequestKeys: "throw" | "strip";
	validateIncomingMessages: boolean;
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
		options.origin,
		route,
		requestArgs as RuntimeArgs | undefined,
		options.unknownRequestKeys,
	);
	const rawSocket = new WebSocket(buildWebSocketUrl(url));
	const rawSend = rawSocket.send.bind(rawSocket);
	const socket = rawSocket as ClientSocket<E>;

	const parseIncomingMessage = (data: unknown): ClientReceived<E> => {
		try {
			const value = JSON.parse(String(data));
			if (!options.validateIncomingMessages) {
				return value as ClientReceived<E>;
			}
			const result = validateStandardSchemaSync(route.messages.server, value);
			if (result.issues) throw result.issues;

			return result.value as ClientReceived<E>;
		} catch {
			rawSocket.close(1007, "Invalid WebSocket message.");
			throw new Error("Invalid WebSocket message.");
		}
	};

	socket.send = (message: ClientSent<E>) => {
		if (socket.readyState !== WebSocket.OPEN) {
			throw new Error("WebSocket is not open");
		}

		rawSend(JSON.stringify(message));
	};

	socket.onOpen = (callback: (event: Event) => void) => {
		socket.addEventListener("open", callback);
		return () => socket.removeEventListener("open", callback);
	};

	socket.onClose = (callback: (event: CloseEvent) => void) => {
		socket.addEventListener("close", callback);
		return () => socket.removeEventListener("close", callback);
	};

	socket.onError = (callback: (event: Event) => void) => {
		socket.addEventListener("error", callback);
		return () => socket.removeEventListener("error", callback);
	};

	socket.onMessage = (callback: (message: ClientReceived<E>) => void) => {
		const onMessage = (event: MessageEvent) => {
			let message: ClientReceived<E>;
			try {
				message = parseIncomingMessage(event.data);
			} catch {
				return;
			}

			callback(message);
		};

		socket.addEventListener("message", onMessage);
		return () => socket.removeEventListener("message", onMessage);
	};

	return socket;
};

export const assertWebSocketRoute = (
	route: RouteDeclaration,
): asserts route is WebSocketRouteDeclaration => {
	if (route.options?.mode !== "websocket") {
		throw new Error("Expected a websocket route");
	}
};
