import {
	type Server as HttpServer,
	type IncomingMessage,
	STATUS_CODES,
} from "node:http";
import type { Duplex } from "node:stream";
import type {
	RouteDeclaration,
	WebSocketRouteDeclaration,
} from "@rest-rpc/core/contract";
import {
	type BeforeWebSocketUpgrade,
	createRouteMatcher,
	handleWebSocketRoute,
	type RawWebSocket,
	type RouteImplementation,
	type UpgradeRejection,
	validateRequest,
} from "@rest-rpc/server";
import type WebSocket from "ws";
import type { WebSocketServer } from "ws";

export type ExpressWebSocketOptions = {
	server: HttpServer;
	webSocketServer: WebSocketServer;
	beforeUpgrade?: BeforeWebSocketUpgrade<{ req: IncomingMessage }>;
};

const serializeUpgradeBody = (body: unknown) => {
	if (body === undefined) {
		return {
			contentType: undefined,
			bodyText: "",
		};
	}

	if (typeof body === "string") {
		return {
			contentType: "text/plain",
			bodyText: body,
		};
	}

	return {
		contentType: "application/json",
		bodyText: JSON.stringify(body),
	};
};

const sendUpgradeRejection = (socket: Duplex, rejection: UpgradeRejection) => {
	const { contentType, bodyText } = serializeUpgradeBody(rejection.body);
	const headers = new Headers();

	if (contentType) headers.set("content-type", contentType);
	for (const [name, value] of Object.entries(rejection.headers ?? {})) {
		if (Array.isArray(value)) {
			for (const entry of value) headers.append(name, String(entry));
			continue;
		}
		if (value !== undefined) headers.set(name, String(value));
	}
	headers.set("content-length", String(Buffer.byteLength(bodyText)));
	headers.set("connection", "close");

	socket.write(
		[
			`HTTP/1.1 ${rejection.status} ${STATUS_CODES[rejection.status] ?? "Error"}`,
			...Array.from(headers, ([name, value]) => `${name}: ${value}`),
			"",
			bodyText,
		].join("\r\n"),
	);
	socket.destroy();
};

const adaptWebSocket = (socket: WebSocket): RawWebSocket => ({
	send(data) {
		socket.send(data);
	},
	close(code, reason) {
		socket.close(code, reason);
	},
	onMessage(callback) {
		const onMessage = (data: WebSocket.RawData) => callback(data);
		socket.on("message", onMessage);
		return () => socket.off("message", onMessage);
	},
	onClose(callback) {
		const onClose = (code: number, reason: Buffer) =>
			callback({ code, reason: reason.toString() });
		socket.on("close", onClose);
		return () => socket.off("close", onClose);
	},
});

export const registerExpressWebSocketRoutes = (
	options: ExpressWebSocketOptions,
	routes: RouteImplementation<WebSocketRouteDeclaration>[],
) => {
	if (routes.length === 0) return;

	const routeContract = Object.fromEntries(
		routes.map((implementation, index) => [
			String(index),
			implementation.route,
		]),
	);
	const matchContractRoute = createRouteMatcher(routeContract);
	const implementationsByRoute = new Map<
		RouteDeclaration,
		RouteImplementation<WebSocketRouteDeclaration>
	>(routes.map((implementation) => [implementation.route, implementation]));

	options.server.on("upgrade", async (req, socket, head) => {
		const url = new URL(req.url ?? "/", "http://localhost");
		const matchedRoute = matchContractRoute({
			method: req.method ?? "GET",
			path: url.pathname,
		});
		if (!matchedRoute) return;

		const implementation = implementationsByRoute.get(matchedRoute.route);
		if (!implementation) return;

		const request = {
			query: Object.fromEntries(url.searchParams),
			params: matchedRoute.params,
			headers: req.headers,
		};
		const requestValidation = validateRequest(implementation.route, request);

		if (!requestValidation.success) {
			sendUpgradeRejection(socket, requestValidation.response);
			return;
		}

		const rejection = await options.beforeUpgrade?.({
			route: implementation.route,
			request: requestValidation.data,
			context: { req },
		});

		if (rejection) {
			sendUpgradeRejection(socket, rejection);
			return;
		}

		options.webSocketServer.handleUpgrade(req, socket, head, (rawSocket) => {
			handleWebSocketRoute(implementation.route, implementation.handler, {
				request: requestValidation.data,
				context: { req },
				socket: adaptWebSocket(rawSocket),
			});
		});
	});
};
