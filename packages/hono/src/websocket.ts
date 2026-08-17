import type { WebSocketRouteDeclaration } from "@rest-rpc/core/contract";
import { toColonPath } from "@rest-rpc/core/contract";
import {
	type BeforeWebSocketUpgrade,
	type CloseEventLike,
	handleWebSocketRoute,
	prepareWebSocketUpgrade,
	type RawWebSocket,
	type RouteImplementation,
	type ServerErrorHandlers,
	type UpgradeRejection,
} from "@rest-rpc/server";
import type { Context, Hono } from "hono";
import type { Env } from "hono/types";
import type { UpgradeWebSocket, WSContext, WSEvents } from "hono/ws";

export type HonoWebSocketOptions<TEnv extends Env = Env> = {
	upgradeWebSocket: UpgradeWebSocket;
	beforeUpgrade?: BeforeWebSocketUpgrade<{
		c: Context<TEnv>;
		signal: AbortSignal;
	}>;
	errorHandlers?: Pick<
		ServerErrorHandlers<{ c: Context<TEnv>; signal: AbortSignal }>,
		"onRequestValidationError"
	>;
};

type HonoUpgradeWebSocketMiddleware<TEnv extends Env = Env> = (
	createEvents: (c: Context<TEnv>) => WSEvents | Promise<WSEvents>,
) => (c: Context<TEnv>) => Response | Promise<Response>;

const createHonoRawWebSocket = (
	getSocket: () => WSContext | undefined,
): RawWebSocket & {
	emitMessage(data: unknown): void;
	emitClose(event: CloseEventLike): void;
} => {
	const messageCallbacks = new Set<(data: unknown) => void>();
	const closeCallbacks = new Set<(event: CloseEventLike) => void>();

	return {
		send(data) {
			getSocket()?.send(data);
		},
		close(code, reason) {
			getSocket()?.close(code, reason);
		},
		onMessage(callback) {
			messageCallbacks.add(callback);
			return () => messageCallbacks.delete(callback);
		},
		onClose(callback) {
			closeCallbacks.add(callback);
			return () => closeCallbacks.delete(callback);
		},
		emitMessage(data) {
			for (const callback of messageCallbacks) callback(data);
		},
		emitClose(event) {
			for (const callback of closeCallbacks) callback(event);
		},
	};
};

const createUpgradeRejectionHeaders = (rejection: UpgradeRejection) => {
	const headers = new Headers();

	for (const [name, value] of Object.entries(rejection.headers ?? {})) {
		if (Array.isArray(value)) {
			for (const entry of value) headers.append(name, String(entry));
			continue;
		}
		if (value !== undefined) headers.set(name, String(value));
	}

	return headers;
};

const sendUpgradeRejection = (rejection: UpgradeRejection) =>
	Response.json(rejection.body, {
		status: rejection.status,
		headers: createUpgradeRejectionHeaders(rejection),
	});

export const registerHonoWebSocketRoutes = <TEnv extends Env = Env>(
	app: Hono<TEnv>,
	options: HonoWebSocketOptions<TEnv>,
	routes: RouteImplementation<WebSocketRouteDeclaration>[],
) => {
	for (const implementation of routes) {
		app.get(toColonPath(implementation.route.path), async (c) => {
			const request = {
				query: c.req.query(),
				pathParams: c.req.param(),
				headers: c.req.header(),
			};
			const upgrade = await prepareWebSocketUpgrade({
				implementation,
				request,
				context: { c, signal: c.req.raw.signal },
				beforeUpgrade: options.beforeUpgrade,
				errorHandlers: options.errorHandlers,
			});

			if (!upgrade.ok) return sendUpgradeRejection(upgrade.rejection);

			const upgradeWebSocket =
				options.upgradeWebSocket as unknown as HonoUpgradeWebSocketMiddleware<TEnv>;

			return upgradeWebSocket((): WSEvents => {
				let peer: WSContext | undefined;
				const rawSocket = createHonoRawWebSocket(() => peer);

				return {
					onOpen(_event, socket) {
						peer = socket;
						handleWebSocketRoute(implementation.route, implementation.handler, {
							request: upgrade.request,
							context: { c },
							socket: rawSocket,
						});
					},
					onMessage(event) {
						rawSocket.emitMessage(event.data);
					},
					onClose(event) {
						rawSocket.emitClose(event);
					},
				};
			})(c);
		});
	}
};
