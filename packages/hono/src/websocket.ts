import type { WebSocketRouteDeclaration } from "@rest-rpc/core/contract";
import {
	type CloseEventLike,
	handleWebSocketRoute,
	type RawWebSocket,
	type RouteImplementation,
	validateRequest,
} from "@rest-rpc/server";
import type { Context } from "hono";
import type { Env } from "hono/types";
import type { UpgradeWebSocket, WSContext, WSEvents } from "hono/ws";
import type { HonoApp, HonoWebSocketRegistration } from "./types.ts";

type HonoUpgradeWebSocketMiddleware = (
	createEvents: (c: Context) => WSEvents | Promise<WSEvents>,
) => (c: Context) => Response | Promise<Response>;

export const honoWebSocket = <TEnv extends Env = Env>(
	upgradeWebSocket: UpgradeWebSocket,
	options: HonoWebSocketRegistration<TEnv>["options"] = {},
): HonoWebSocketRegistration<TEnv> => ({
	upgradeWebSocket,
	options,
});

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

export const registerHonoWebSocketRoutes = <TEnv extends Env>(
	app: HonoApp<TEnv>,
	registration: HonoWebSocketRegistration<TEnv>,
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

			const rejection = await registration.options.beforeUpgrade?.({
				c,
				route: implementation.route,
				request,
			});

			if (rejection) return rejection;

			const upgradeWebSocket =
				registration.upgradeWebSocket as unknown as HonoUpgradeWebSocketMiddleware;

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
