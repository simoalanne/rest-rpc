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

export type BeforeWebSocketUpgradeInput<
	TContext extends Record<string, unknown>,
> = TContext & {
	route: WebSocketRouteDeclaration;
	request: Record<string, unknown>;
};

export type BeforeWebSocketUpgradeResult =
	| UpgradeRejection
	| undefined
	| Promise<UpgradeRejection | undefined>;

export type BeforeWebSocketUpgrade<TContext extends Record<string, unknown>> = (
	input: BeforeWebSocketUpgradeInput<TContext>,
) => BeforeWebSocketUpgradeResult;

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
	options: {
		request: Record<string, unknown>;
		context: TContext;
		socket: RawWebSocket;
	},
) => {
	const socket = createContractWebSocket(route, options.socket);

	void Promise.resolve()
		.then(() =>
			handler({
				...options.request,
				[REQUEST_CONTEXT_KEY]: {
					...options.context,
					socket,
				},
			}),
		)
		.catch(() => {
			socket.close(1011, "WebSocket service failed.");
		});
};
