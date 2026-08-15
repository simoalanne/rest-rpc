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
	prepareWebSocketUpgrade,
	type RawWebSocket,
	type RouteImplementation,
	type ServerErrorHandlers,
	type UpgradeRejection,
} from "@rest-rpc/server";
import type { Request } from "express";
import type WebSocket from "ws";
import type { WebSocketServer } from "ws";

export type ExpressWebSocketOptions = {
	server: HttpServer;
	webSocketServer: WebSocketServer;
	beforeUpgrade?: BeforeWebSocketUpgrade<{
		kind: "websocket";
		req: IncomingMessage;
	}>;
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
	errorHandlers?: ServerErrorHandlers<
		| {
				kind: "http";
				req: Request;
		  }
		| {
				kind: "websocket";
				req: IncomingMessage;
		  }
	>,
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
		if (matchedRoute.type === "methodNotAllowed") {
			sendUpgradeRejection(socket, { status: 405 });
			return;
		}

		const implementation = implementationsByRoute.get(matchedRoute.route);
		if (!implementation) return;

		const request = {
			query: Object.fromEntries(url.searchParams),
			pathParams: matchedRoute.params,
			headers: req.headers,
		};
		const upgrade = await prepareWebSocketUpgrade<{
			kind: "websocket";
			req: IncomingMessage;
		}>({
			implementation,
			request,
			context: { kind: "websocket", req },
			beforeUpgrade: options.beforeUpgrade,
			errorHandlers: errorHandlers as
				| Pick<
						ServerErrorHandlers<{
							kind: "websocket";
							req: IncomingMessage;
						}>,
						"onRequestValidationError"
				  >
				| undefined,
		});

		if (!upgrade.ok) {
			sendUpgradeRejection(socket, upgrade.rejection);
			return;
		}

		options.webSocketServer.handleUpgrade(req, socket, head, (rawSocket) => {
			handleWebSocketRoute(implementation.route, implementation.handler, {
				request: upgrade.request,
				context: { req },
				socket: adaptWebSocket(rawSocket),
			});
		});
	});
};
