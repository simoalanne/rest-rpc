import type { WebSocketRouteDeclaration } from "@rest-rpc/core/contract";
import {
	REQUEST_CONTEXT_KEY,
	validateWebSocketMessageSync,
} from "@rest-rpc/core/contract";
import type { ServerErrorHandlers } from "./errorHandlers.ts";
import type { HttpHeaders } from "./headers.ts";
import type {
	CloseEventLike,
	RouteImplementation,
	RouteReceived,
	RouteSocket,
	RuntimeRouteHandler,
	WebSocketRouteHandlerContext,
} from "./router.ts";
import type {
	RequestSegments,
	RequestValidationResponse,
} from "./validation.ts";
import { validateRequest } from "./validation.ts";

export type WebSocketLike = {
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
		"onRequestValidationError" | "onUnhandledError"
	>;
};

type PrepareWebSocketUpgradeResult =
	| { ok: true; request: Record<string, unknown> }
	| { ok: false; rejection: UpgradeRejection };

type UpgradeRejectionResult = Extract<
	PrepareWebSocketUpgradeResult,
	{ ok: false }
>;

type UpgradeRequestValidationResult =
	| { ok: true; validation: RequestValidationResponse }
	| UpgradeRejectionResult;

const defaultUnhandledUpgradeErrorRejection: UpgradeRejection = {
	status: 500,
	body: {
		message: "WebSocket upgrade failed.",
	},
};

const handleUnhandledUpgradeError = async <
	TContext extends Record<string, unknown>,
>(
	error: unknown,
	{
		implementation,
		request,
		context,
		errorHandlers,
	}: PrepareWebSocketUpgradeOptions<TContext>,
): Promise<UpgradeRejectionResult> => {
	const rejection =
		(await errorHandlers?.onUnhandledError?.({
			route: implementation.route,
			request,
			context,
			error,
		})) ?? defaultUnhandledUpgradeErrorRejection;

	return { ok: false, rejection };
};

const validateUpgradeRequest = async <TContext extends Record<string, unknown>>(
	options: PrepareWebSocketUpgradeOptions<TContext>,
): Promise<UpgradeRequestValidationResult> => {
	try {
		return {
			ok: true,
			validation: await validateRequest(
				options.implementation.route,
				options.request,
			),
		};
	} catch (error) {
		return handleUnhandledUpgradeError(error, options);
	}
};

const rejectInvalidUpgradeRequest = async <
	TContext extends Record<string, unknown>,
>(
	validation: Extract<RequestValidationResponse, { success: false }>,
	{
		implementation,
		request,
		context,
		errorHandlers,
	}: PrepareWebSocketUpgradeOptions<TContext>,
): Promise<PrepareWebSocketUpgradeResult> => {
	const rejection =
		(await errorHandlers?.onRequestValidationError?.({
			route: implementation.route,
			request,
			context,
			issues: validation.response.body.validationErrors,
		})) ?? validation.response;

	return { ok: false, rejection };
};

const prepareAcceptedUpgrade = async <TContext extends Record<string, unknown>>(
	request: Record<string, unknown>,
	options: PrepareWebSocketUpgradeOptions<TContext>,
): Promise<PrepareWebSocketUpgradeResult> => {
	try {
		const rejection = await options.beforeUpgrade?.({
			route: options.implementation.route,
			request,
			context: options.context,
		});

		if (rejection) return { ok: false, rejection };
		return { ok: true, request };
	} catch (error) {
		return handleUnhandledUpgradeError(error, {
			...options,
			request,
		});
	}
};

export async function prepareWebSocketUpgrade<
	TContext extends Record<string, unknown> = Record<string, unknown>,
>(
	options: PrepareWebSocketUpgradeOptions<TContext>,
): Promise<PrepareWebSocketUpgradeResult> {
	const requestValidation = await validateUpgradeRequest(options);

	if (!requestValidation.ok) return requestValidation;

	if (!requestValidation.validation.success) {
		return rejectInvalidUpgradeRequest(requestValidation.validation, options);
	}

	return prepareAcceptedUpgrade(requestValidation.validation.data, options);
}

export function createContractWebSocket<E extends WebSocketRouteDeclaration>(
	route: E,
	socket: WebSocketLike,
): RouteSocket<E> {
	const parseIncomingMessage = (data: unknown): RouteReceived<E> => {
		try {
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
			const result = validateWebSocketMessageSync(
				route.messages.server,
				message,
			);
			if (result.issues) throw result.issues;

			socket.send(JSON.stringify(result.value));
		},
		onMessage(callback) {
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
