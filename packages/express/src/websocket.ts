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
	createRequestParsingErrorResponse,
	createRouteMatcher,
	handleWebSocketRoute,
	prepareWebSocketUpgrade,
	type RouteImplementation,
	type ServerErrorHandlers,
	type UpgradeRejection,
	type WebSocketLike,
} from "@rest-rpc/server";
import type WebSocket from "ws";
import type { WebSocketServer } from "ws";
import type { ExpressErrorContext } from "./registerRoutes.ts";

export type ExpressWebSocketOptions = {
	server: HttpServer;
	webSocketServer: WebSocketServer;
	beforeUpgrade?: BeforeWebSocketUpgrade<{
		kind: "websocket";
		req: IncomingMessage;
		signal: AbortSignal;
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

const adaptWebSocket = (socket: WebSocket): WebSocketLike => ({
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
	errorHandlers?: ServerErrorHandlers<ExpressErrorContext>,
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
		let url: URL;
		let matchedRoute: ReturnType<typeof matchContractRoute>;
		try {
			url = new URL(req.url ?? "/", "http://localhost");
			matchedRoute = matchContractRoute({
				method: req.method ?? "GET",
				path: url.pathname,
			});
		} catch {
			sendUpgradeRejection(socket, createRequestParsingErrorResponse());
			return;
		}

		if (!matchedRoute.matched) return;

		const implementation = implementationsByRoute.get(matchedRoute.route);
		if (!implementation) return;
		const controller = new AbortController();
		const abort = () => controller.abort();
		req.once("aborted", abort);
		socket.once("close", abort);

		const request = {
			query: Object.fromEntries(url.searchParams),
			params: matchedRoute.params,
			headers: req.headers,
		};

		const upgrade = await prepareWebSocketUpgrade({
			implementation,
			request,
			context: { kind: "websocket", req, signal: controller.signal },
			beforeUpgrade: options.beforeUpgrade,
			errorHandlers,
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
