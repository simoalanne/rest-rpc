import type { WebSocketRouteDeclaration } from "@rest-rpc/core/contract";
import {
	type BeforeWebSocketUpgrade,
	type CloseEventLike,
	handleWebSocketRoute,
	type RawWebSocket,
	type RouteImplementation,
	type UpgradeRejection,
	validateRequest,
} from "@rest-rpc/server";
import type { Context, Hono } from "hono";
import type { Env } from "hono/types";
import type { UpgradeWebSocket, WSContext, WSEvents } from "hono/ws";

export type HonoWebSocketOptions<TEnv extends Env = Env> = {
	upgradeWebSocket: UpgradeWebSocket;
	beforeUpgrade?: BeforeWebSocketUpgrade<{ c: Context<TEnv> }>;
};

type HonoUpgradeWebSocketMiddleware = (
	createEvents: (c: Context) => WSEvents | Promise<WSEvents>,
) => (c: Context) => Response | Promise<Response>;

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

export const registerHonoWebSocketRoutes = (
	app: Hono,
	options: HonoWebSocketOptions,
	routes: RouteImplementation<WebSocketRouteDeclaration>[],
) => {
	for (const implementation of routes) {
		app.get(implementation.route.path, async (c) => {
			const request = {
				query: c.req.query(),
				params: c.req.param(),
				headers: c.req.header(),
			};
			const requestValidation = validateRequest(implementation.route, request);

			if (!requestValidation.success) {
				return Response.json(requestValidation.response.body, {
					status: requestValidation.response.status,
				});
			}

			const rejection = await options.beforeUpgrade?.({
				route: implementation.route,
				request: requestValidation.data,
				context: { c },
			});

			if (rejection) return sendUpgradeRejection(rejection);

			const upgradeWebSocket =
				options.upgradeWebSocket as unknown as HonoUpgradeWebSocketMiddleware;

			return upgradeWebSocket((): WSEvents => {
				let peer: WSContext | undefined;
				const rawSocket = createHonoRawWebSocket(() => peer);

				return {
					onOpen(_event, socket) {
						peer = socket;
						handleWebSocketRoute(implementation.route, implementation.handler, {
							request: requestValidation.data,
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
