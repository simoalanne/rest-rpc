import {
	type Server as HttpServer,
	type IncomingMessage,
	STATUS_CODES,
} from "node:http";
import type { Duplex } from "node:stream";
import type { WebSocketRouteDeclaration } from "@rest-rpc/core/contract";
import {
	createPathMatcher,
	handleWebSocketRoute,
	type MatchableRequest,
	type RawWebSocket,
	type RouteImplementation,
	type UpgradeRejection,
	validateRequest,
} from "@rest-rpc/server";
import type WebSocket from "ws";
import type { WebSocketServer } from "ws";

type ExpressBeforeUpgradeInput = {
	req: IncomingMessage;
	route: WebSocketRouteDeclaration;
	request: {
		query: Record<string, string>;
		params: Record<string, string>;
		headers: IncomingMessage["headers"];
	};
};

type ExpressBeforeUpgradeResult = undefined | UpgradeRejection;

export type ExpressWebSocketOptions = {
	beforeUpgrade?: (
		input: ExpressBeforeUpgradeInput,
	) => ExpressBeforeUpgradeResult | Promise<ExpressBeforeUpgradeResult>;
};

export type ExpressWebSocketRegistration = {
	server: HttpServer;
	webSocketServer: WebSocketServer;
	options: ExpressWebSocketOptions;
};

type PreparedExpressWebSocketRoute =
	RouteImplementation<WebSocketRouteDeclaration> & {
		matchPath: (path: string) => Record<string, string> | null;
	};

export const expressWebSocket = (
	server: HttpServer,
	webSocketServer: WebSocketServer,
	options: ExpressWebSocketOptions = {},
): ExpressWebSocketRegistration => ({
	server,
	webSocketServer,
	options,
});

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

const matchUpgradeRoute = (
	matchers: PreparedExpressWebSocketRoute[],
	req: MatchableRequest,
) => {
	for (const matcher of matchers) {
		const params = matcher.matchPath(req.path);
		if (matcher.route.method === req.method && params !== null) {
			return {
				route: matcher.route,
				params,
				handler: matcher.handler,
			};
		}
	}

	return null;
};

export const registerExpressWebSocketRoutes = (
	registration: ExpressWebSocketRegistration,
	routes: RouteImplementation<WebSocketRouteDeclaration>[],
) => {
	if (routes.length === 0) return;

	const routeMatchers = routes.map((implementation) => ({
		...implementation,
		matchPath: createPathMatcher(implementation.route.path),
	}));

	registration.server.on("upgrade", async (req, socket, head) => {
		const url = new URL(req.url ?? "/", "http://localhost");
		const matchedRoute = matchUpgradeRoute(routeMatchers, {
			method: req.method ?? "GET",
			path: url.pathname,
		});
		if (!matchedRoute) return;

		const request = {
			query: Object.fromEntries(url.searchParams),
			params: matchedRoute.params,
			headers: req.headers,
		};
		const requestValidation = validateRequest(matchedRoute.route, request);

		if (!requestValidation.success) {
			sendUpgradeRejection(socket, requestValidation.response);
			return;
		}

		const rejection = await registration.options.beforeUpgrade?.({
			req,
			route: matchedRoute.route,
			request,
		});

		if (rejection) {
			sendUpgradeRejection(socket, rejection);
			return;
		}

		registration.webSocketServer.handleUpgrade(
			req,
			socket,
			head,
			(rawSocket) => {
				const result = handleWebSocketRoute(
					matchedRoute.route,
					matchedRoute.handler,
					{
						request,
						context: { req },
						socket: adaptWebSocket(rawSocket),
					},
				);

				if (!result.ok) {
					rawSocket.close(1008, "WebSocket upgrade validation failed.");
				}
			},
		);
	});
};
