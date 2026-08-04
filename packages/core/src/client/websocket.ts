import type {
	InferRouteClientMessage,
	InferRouteServerMessage,
	RouteDeclaration,
	WebSocketRouteDeclaration,
} from "../contract/route.ts";
import { validateStandardSchemaSync } from "../standard-schema/index.ts";
import { constructBaseRequest, takesRequestInput } from "./request.ts";
import type {
	ConnectArgs,
	InferRouteClientMessageResult,
	InferRouteClientSocket,
	RuntimeArgs,
} from "./types.ts";

export const buildWebSocketUrl = (url: string) => {
	if (url.startsWith("http:")) return url.replace("http:", "ws:");
	return url.replace("https:", "wss:");
};

export type WebSocketConnectionOptions = {
	baseUrl: string;
	unknownRequestKeys: "throw" | "strip";
};

export const connect = <E extends WebSocketRouteDeclaration>(
	route: E,
	options: WebSocketConnectionOptions,
	...args: ConnectArgs<E>
): InferRouteClientSocket<E> => {
	if (typeof WebSocket === "undefined") {
		throw new Error("WebSocket is not available in this runtime");
	}

	const requestArgs = takesRequestInput(route) ? args[0] : undefined;
	const { url } = constructBaseRequest(
		options.baseUrl,
		route,
		requestArgs as RuntimeArgs,
		options.unknownRequestKeys,
	);
	const rawSocket = new WebSocket(buildWebSocketUrl(url));
	const rawSend = rawSocket.send.bind(rawSocket);
	const socket = rawSocket as InferRouteClientSocket<E>;

	const parseIncomingMessage = (
		data: unknown,
	): InferRouteClientMessageResult<E> => {
		try {
			const result = validateStandardSchemaSync(
				route.messages.server,
				JSON.parse(data as string),
			);
			if (result.issues) throw result.issues;

			return {
				success: true,
				data: result.value as InferRouteServerMessage<E>,
			};
		} catch {
			return {
				success: false,
			};
		}
	};

	socket.send = (message: InferRouteClientMessage<E>) => {
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

	socket.onMessage = (
		callback: (result: InferRouteClientMessageResult<E>) => void,
	) => {
		const onMessage = (event: MessageEvent) => {
			callback(parseIncomingMessage(event.data));
		};

		socket.addEventListener("message", onMessage);
		return () => socket.removeEventListener("message", onMessage);
	};

	return socket;
};

export const tryConnect = <E extends WebSocketRouteDeclaration>(
	route: E,
	options: WebSocketConnectionOptions,
	...args: ConnectArgs<E>
) => {
	try {
		const data = connect(route, options, ...args);
		return { success: true, data } as const;
	} catch (error) {
		return { success: false, error } as const;
	}
};

export const assertWebSocketRoute = (
	route: RouteDeclaration,
): asserts route is WebSocketRouteDeclaration => {
	if (route.options?.mode !== "websocket") {
		throw new Error("Expected a websocket route");
	}
};
