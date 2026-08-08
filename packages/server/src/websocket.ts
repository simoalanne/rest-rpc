import { validateStandardSchemaSync } from "@rest-rpc/core";
import type {
	InferReceivedClientMessage,
	InferServerMessage,
	WebSocketRouteDeclaration,
} from "@rest-rpc/core/contract";
import { REQUEST_CONTEXT_KEY } from "@rest-rpc/core/contract";
import type { HttpHeaders } from "./headers.ts";
import type {
	CloseEventLike,
	ContractWebSocket,
	RuntimeRouteHandler,
	WebSocketRouteHandlerContext,
} from "./router.ts";
import { type RequestSegments, validateRequest } from "./validation.ts";

export type RawWebSocket = {
	send(data: string): void;
	close(code?: number, reason?: string): void;
	onMessage(callback: (data: unknown) => void): () => void;
	onClose(callback: (event: CloseEventLike) => void): () => void;
};

export type UpgradeRejection = {
	status: number;
	headers?: HttpHeaders;
	body?: unknown;
};

export type WebSocketRouteResult =
	| { ok: true }
	| { ok: false; rejection: UpgradeRejection };

export type HandleWebSocketRouteOptions<
	TContext extends WebSocketRouteHandlerContext,
> = {
	request: RequestSegments;
	context: TContext;
	socket: RawWebSocket;
};

export const createContractWebSocket = <E extends WebSocketRouteDeclaration>(
	route: E,
	socket: RawWebSocket,
): ContractWebSocket<InferServerMessage<E>, InferReceivedClientMessage<E>> => {
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

	return {
		send(message) {
			const result = validateStandardSchemaSync(route.messages.server, message);
			if (result.issues) throw result.issues;

			socket.send(JSON.stringify(result.value));
		},
		onMessage(callback) {
			return socket.onMessage((data) => {
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
			});
		},
		onClose(callback) {
			return socket.onClose((event) => {
				void Promise.resolve()
					.then(() => callback(event))
					.catch(() => {});
			});
		},
		close(code, reason) {
			socket.close(code, reason);
		},
	};
};

export const handleWebSocketRoute = <
	E extends WebSocketRouteDeclaration,
	TContext extends WebSocketRouteHandlerContext = WebSocketRouteHandlerContext,
>(
	route: E,
	handler: RuntimeRouteHandler,
	options: HandleWebSocketRouteOptions<TContext>,
): WebSocketRouteResult => {
	const requestValidation = validateRequest(route, options.request);

	if (!requestValidation.success) {
		return {
			ok: false,
			rejection: requestValidation.response,
		};
	}

	const socket = createContractWebSocket(route, options.socket);

	void Promise.resolve()
		.then(() =>
			handler({
				...requestValidation.data,
				[REQUEST_CONTEXT_KEY]: {
					...options.context,
					socket,
				},
			}),
		)
		.catch(() => {
			socket.close(1011, "WebSocket service failed.");
		});

	return { ok: true };
};
