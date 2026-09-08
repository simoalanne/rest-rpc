import type { WebSocketRouteDeclaration } from "@rest-rpc/core/contract";
import {
	REQUEST_CONTEXT_KEY,
	validateWebSocketMessageSync,
} from "@rest-rpc/core/contract";
import type { HttpHeaders } from "./headers.ts";
import { flattenRequestData } from "./requestData.ts";
import { RequestValidationError } from "./validationErrors.ts";
import type {
	CloseEventLike,
	RouteImplementation,
	RouteReceived,
	RouteSocket,
	RuntimeRouteHandler,
	WebSocketRouteHandlerContext,
} from "./router.ts";
import type { RequestSegments } from "./validation.ts";
import { validateRequest } from "./validation.ts";

/**
 * Minimal WebSocket shape required by the shared WebSocket route handler.
 *
 * @see {@link https://rest-rpc.dev/docs/advanced/building-server-adapters#websocket-routes}
 */
export type WebSocketLike = {
	send(data: string): void;
	close(code?: number, reason?: string): void;
	onMessage(callback: (data: unknown) => void): () => void;
	onClose(callback: (event: CloseEventLike) => void): () => void;
};

/**
 * Response data used to reject a WebSocket upgrade before accepting it.
 *
 * @see {@link https://rest-rpc.dev/docs/websockets#before-upgrade}
 */
export type UpgradeRejection = {
	status: number;
	headers?: HttpHeaders;
	body?: unknown;
};

/**
 * Input passed to a `beforeUpgrade` hook.
 *
 * @see {@link https://rest-rpc.dev/docs/websockets#before-upgrade}
 */
export type WebSocketUpgradeInput<TContext extends Record<string, unknown>> = {
	route: WebSocketRouteDeclaration;
	request: Record<string, unknown>;
	context: TContext;
};

/**
 * Return value accepted from a `beforeUpgrade` hook.
 *
 * @see {@link https://rest-rpc.dev/docs/websockets#before-upgrade}
 */
export type WebSocketUpgradeResult =
	| UpgradeRejection
	| undefined
	| Promise<UpgradeRejection | undefined>;

/**
 * Hook invoked after request validation and before accepting a WebSocket upgrade.
 *
 * @see {@link https://rest-rpc.dev/docs/websockets#before-upgrade}
 */
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
};

type PrepareWebSocketUpgradeResult =
	| { ok: true; request: Record<string, unknown> }
	| { ok: false; rejection: UpgradeRejection };

/**
 * Validates and optionally rejects a WebSocket upgrade request.
 *
 * @remarks Call this before the runtime accepts the WebSocket upgrade.
 * @see {@link https://rest-rpc.dev/docs/advanced/building-server-adapters#websocket-routes}
 */
export async function prepareWebSocketUpgrade<
	TContext extends Record<string, unknown> = Record<string, unknown>,
>(
	options: PrepareWebSocketUpgradeOptions<TContext>,
): Promise<PrepareWebSocketUpgradeResult> {
	const validation = await validateRequest(
		options.implementation.route,
		options.request,
	);
	if (!validation.success) throw new RequestValidationError(validation.issues);

	const request = flattenRequestData(
		options.implementation.route,
		validation.data,
	);
	const rejection = await options.beforeUpgrade?.({
		route: options.implementation.route,
		request,
		context: options.context,
	});

	if (rejection) return { ok: false, rejection };
	return { ok: true, request };
}

/**
 * Wraps a runtime WebSocket with typed rest-rpc send and receive helpers.
 *
 * @see {@link https://rest-rpc.dev/docs/advanced/building-server-adapters#websocket-routes}
 */
export function createContractWebSocket<E extends WebSocketRouteDeclaration>(
	route: E,
	socket: WebSocketLike,
): RouteSocket<E> {
	const parseIncomingMessage = (data: unknown): RouteReceived<E> => {
		try {
			if (!route.messages.client) {
				throw new Error("No client WebSocket messages are declared");
			}

			const result = validateWebSocketMessageSync(
				route.messages.client,
				JSON.parse(String(data)),
			);
			if (result.issues) throw result.issues;

			return result.value as RouteReceived<E>;
		} catch {
			socket.close(1007, "Invalid WebSocket message.");
			throw new Error("Invalid WebSocket message.");
		}
	};

	return {
		send(message) {
			if (!route.messages.server) {
				throw new Error("No server WebSocket messages are declared");
			}

			const result = validateWebSocketMessageSync(
				route.messages.server,
				message,
			);
			if (result.issues) throw result.issues;

			socket.send(JSON.stringify(result.value));
		},
		onMessage(callback) {
			if (!route.messages.client) return () => {};

			return socket.onMessage((data) => {
				let message: RouteReceived<E>;
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
}

/**
 * Starts a typed WebSocket route handler on an accepted socket.
 *
 * @remarks Call this only after the runtime accepts the WebSocket connection.
 * @see {@link https://rest-rpc.dev/docs/advanced/building-server-adapters#websocket-routes}
 */
export function handleWebSocketRoute<
	E extends WebSocketRouteDeclaration,
	TContext extends WebSocketRouteHandlerContext = WebSocketRouteHandlerContext,
>(
	route: E,
	handler: RuntimeRouteHandler,
	options: {
		request: Record<string, unknown>;
		context: TContext;
		socket: WebSocketLike;
	},
) {
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
}
