import type {
	ServerReceived,
	ServerSent,
	WebSocketRouteDeclaration,
} from "@rest-rpc/core/contract";
import { REQUEST_CONTEXT_KEY } from "@rest-rpc/core/contract";
import { validateStandardSchemaSync } from "@rest-rpc/core/standard-schema";
import type { ServerErrorHandlers } from "./errorHandlers.ts";
import type { HttpHeaders } from "./headers.ts";
import type {
	CloseEventLike,
	ContractWebSocket,
	RouteImplementation,
	RuntimeRouteHandler,
	WebSocketRouteHandlerContext,
} from "./router.ts";
import type { RequestSegments } from "./validation.ts";
import { validateRequest } from "./validation.ts";

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

export type WebSocketUpgradeInput<TContext extends Record<string, unknown>> = {
	route: WebSocketRouteDeclaration;
	request: Record<string, unknown>;
	context: TContext;
};

export type WebSocketUpgradeResult =
	| UpgradeRejection
	| undefined
	| Promise<UpgradeRejection | undefined>;

export type BeforeWebSocketUpgrade<TContext extends Record<string, unknown>> = (
	input: WebSocketUpgradeInput<TContext>,
) => WebSocketUpgradeResult;

type PrepareWebSocketUpgradeOptions<
	TContext extends Record<string, unknown> = Record<string, unknown>,
> = {
	implementation: RouteImplementation<WebSocketRouteDeclaration>;
	request: RequestSegments;
	context: TContext;
	beforeUpgrade?: BeforeWebSocketUpgrade<TContext>;
	errorHandlers?: Pick<
		ServerErrorHandlers<TContext>,
		"onRequestValidationError"
	>;
};

type PrepareWebSocketUpgradeResult =
	| { ok: true; request: Record<string, unknown> }
	| { ok: false; rejection: UpgradeRejection };

export const prepareWebSocketUpgrade = async <
	TContext extends Record<string, unknown> = Record<string, unknown>,
>({
	implementation,
	request,
	context,
	beforeUpgrade,
	errorHandlers,
}: PrepareWebSocketUpgradeOptions<TContext>): Promise<PrepareWebSocketUpgradeResult> => {
	const requestValidation = validateRequest(implementation.route, request);

	if (!requestValidation.success) {
		const rejection =
			(await errorHandlers?.onRequestValidationError?.({
				route: implementation.route,
				request,
				context,
				issues: requestValidation.response.body.validationErrors,
			})) ?? requestValidation.response;

		return { ok: false, rejection };
	}

	const rejection = await beforeUpgrade?.({
		route: implementation.route,
		request: requestValidation.data,
		context,
	});

	if (rejection) return { ok: false, rejection };

	return { ok: true, request: requestValidation.data };
};

export const createContractWebSocket = <E extends WebSocketRouteDeclaration>(
	route: E,
	socket: RawWebSocket,
): ContractWebSocket<ServerSent<E>, ServerReceived<E>> => {
	const parseIncomingMessage = (data: unknown): ServerReceived<E> => {
		try {
			const result = validateStandardSchemaSync(
				route.messages.client,
				JSON.parse(String(data)),
			);
			if (result.issues) throw result.issues;

			return result.value as ServerReceived<E>;
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
				let message: ServerReceived<E>;
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
