import type { Server as HttpServer } from "node:http";
import type { Duplex } from "node:stream";
import { REQUEST_CONTEXT_KEY } from "@contract-first-api/core/contract";
import {
	createPathMatcher,
	validateRequestSegments,
} from "@contract-first-api/server";
import type WebSocket from "ws";
import { WebSocketServer } from "ws";
import { flattenWebSocketImplementationTree } from "../server/routeTree.ts";
import type { WebSocketImplementationTree } from "./route.ts";
import { createRouteWebSocket } from "./socket.ts";

export type RegisterWebSocketRoutesOptions = Record<never, never>;

const sendUpgradeError = (
	socket: Duplex,
	statusCode: number,
	body: unknown,
) => {
	const bodyText = JSON.stringify(body);
	socket.write(
		[
			`HTTP/1.1 ${statusCode} ${statusCode === 400 ? "Bad Request" : "Internal Server Error"}`,
			"content-type: application/json",
			`content-length: ${Buffer.byteLength(bodyText)}`,
			"connection: close",
			"",
			bodyText,
		].join("\r\n"),
	);
	socket.destroy();
};

const runWebSocketHandler = (
	handler: (request: unknown) => unknown | Promise<unknown>,
	request: unknown,
	socket: Pick<WebSocket, "close">,
) => {
	void Promise.resolve()
		.then(() => handler(request))
		.catch(() => {
			socket.close(1011, "WebSocket service failed.");
		});
};

export const registerWebSocketRoutes = (
	server: HttpServer,
	implementations: WebSocketImplementationTree,
	_options: RegisterWebSocketRoutesOptions = {},
) => {
	const routes = flattenWebSocketImplementationTree(implementations);
	if (routes.length === 0) return;

	const webSocketServer = new WebSocketServer({ noServer: true });
	const routeMatchers = routes.map(({ route, handler }) => ({
		route,
		match: createPathMatcher(route.path),
		handler,
	}));

	server.on("upgrade", async (req, socket, head) => {
		const url = new URL(req.url ?? "/", "http://localhost");
		const matchedRoute = routeMatchers.find(({ match }) => match(url.pathname));
		if (!matchedRoute) return;

		const params = matchedRoute.match(url.pathname) ?? {};
		const query = Object.fromEntries(url.searchParams);
		const requestValidation = validateRequestSegments(matchedRoute.route, {
			query,
			params,
		});

		if (!requestValidation.success) {
			sendUpgradeError(socket, 400, {
				message:
					"Request validation failed. Check the validationErrors field for details.",
				validationErrors: requestValidation.errors,
			});
			return;
		}

		webSocketServer.handleUpgrade(req, socket, head, (rawSocket) => {
			const routeSocket = createRouteWebSocket(rawSocket, matchedRoute.route);
			runWebSocketHandler(
				matchedRoute.handler,
				{
					...requestValidation.data,
					[REQUEST_CONTEXT_KEY]: {
						req,
						socket: routeSocket,
					},
				},
				routeSocket,
			);
		});
	});
};
