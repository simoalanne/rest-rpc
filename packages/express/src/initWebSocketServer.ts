import type { Server as HttpServer, IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";
import type {
	InferRouteClientMessage,
	InferRouteServerMessage,
	RouteDeclaration,
	WebSocketRouteDeclaration,
} from "@contract-first-api/core/contract";
import type { Request } from "express";
import type WebSocket from "ws";
import { WebSocketServer } from "ws";
import type { EmptyObject, ValidationResult } from "./initServer.ts";

export type InferRouteServerMessageResult<E extends WebSocketRouteDeclaration> =
	| { success: true; data: InferRouteServerReceivedMessage<E> }
	| { success: false };

export type InferRouteServerReceivedMessage<
	E extends WebSocketRouteDeclaration,
> = InferRouteClientMessage<E>;

export type InferRouteServerSendMessage<E extends WebSocketRouteDeclaration> =
	InferRouteServerMessage<E>;

export type InferRouteServerSocket<E extends WebSocketRouteDeclaration> = Omit<
	WebSocket,
	"send" | "on" | "off"
> & {
	send: (message: InferRouteServerSendMessage<E>) => void;
	onMessage: (
		callback: (result: InferRouteServerMessageResult<E>) => void,
	) => () => void;
	onClose: (callback: (code: number, reason: Buffer) => void) => () => void;
};

type KnownContractErrorShape = Error & {
	readonly error: Record<string, unknown>;
	readonly status: number;
};

type WebSocketRoute = WebSocketRouteDeclaration & {
	handler: (request: unknown) => unknown | Promise<unknown>;
};

type RegisterWebSocketRoutesOptions<TContext> = {
	server: HttpServer;
	routes: WebSocketRoute[];
	createContext?: (
		req: Request & { route: RouteDeclaration },
	) => TContext | Promise<TContext>;
	createPathMatcher: (
		path: string,
	) => (pathname: string) => Record<string, string> | null;
	validateRequestSegments: (
		route: RouteDeclaration,
		segments: {
			body?: unknown;
			query?: unknown;
			params?: unknown;
		},
		segmentNames?: Array<"body" | "query" | "params">,
	) => ValidationResult;
	isKnownContractError: (error: unknown) => error is KnownContractErrorShape;
};

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

const createRouteWebSocket = <E extends WebSocketRouteDeclaration>(
	socket: WebSocket,
	route: E,
): InferRouteServerSocket<E> => {
	const rawSend = socket.send.bind(socket);
	const routeSocket = socket as unknown as InferRouteServerSocket<E>;

	const parseIncomingMessage = (
		data: unknown,
	): InferRouteServerMessageResult<E> => {
		try {
			return {
				success: true,
				data: route.messages.client.parse(
					JSON.parse(String(data)),
				) as InferRouteClientMessage<E>,
			};
		} catch {
			return { success: false };
		}
	};

	routeSocket.send = (message: InferRouteServerSendMessage<E>) => {
		rawSend(JSON.stringify(message));
	};

	routeSocket.onMessage = (callback) => {
		const onMessage = (data: WebSocket.RawData) => {
			void Promise.resolve()
				.then(() => callback(parseIncomingMessage(data)))
				.catch(() => {
					socket.close(1011, "WebSocket message handler failed.");
				});
		};

		socket.on("message", onMessage);
		return () => socket.off("message", onMessage);
	};

	routeSocket.onClose = (callback) => {
		const onClose = (code: number, reason: Buffer) => {
			void Promise.resolve()
				.then(() => callback(code, reason))
				.catch(() => {});
		};

		socket.on("close", onClose);
		return () => socket.off("close", onClose);
	};

	return routeSocket;
};

const runWebSocketServiceHandler = (
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

export const registerWebSocketRoutes = <TContext>({
	server,
	routes,
	createContext,
	createPathMatcher,
	validateRequestSegments,
	isKnownContractError,
}: RegisterWebSocketRoutesOptions<TContext>) => {
	if (routes.length === 0) return;

	const webSocketServer = new WebSocketServer({ noServer: true });
	const routeMatchers = routes.map((route) => ({
		route,
		match: createPathMatcher(route.path),
		handler: route.handler,
	}));

	server.on("upgrade", async (req, socket, head) => {
		const url = new URL(req.url ?? "/", "http://localhost");
		const matchedRoute = routeMatchers.find(({ match }) => match(url.pathname));
		if (!matchedRoute) return;

		const params = matchedRoute.match(url.pathname) ?? {};
		const query = Object.fromEntries(url.searchParams);
		const validation = validateRequestSegments(
			matchedRoute.route,
			{
				query,
				params,
			},
			["query", "params"],
		);

		if (!validation.success) {
			sendUpgradeError(socket, 400, {
				message:
					"Request validation failed. Check the validationErrors field for details.",
				validationErrors: validation.errors,
			});
			return;
		}

		const upgradeRequest = req as IncomingMessage & {
			route: RouteDeclaration;
			validatedRequest: Record<string, unknown>;
		};
		upgradeRequest.route = matchedRoute.route;
		upgradeRequest.validatedRequest = validation.data;

		let context: TContext | EmptyObject = {};
		try {
			context =
				(await createContext?.(
					upgradeRequest as unknown as Request & {
						route: RouteDeclaration;
					},
				)) || {};
		} catch (error) {
			if (isKnownContractError(error)) {
				sendUpgradeError(socket, error.status, error.error);
				return;
			}
			sendUpgradeError(socket, 500, {
				code: "unknown",
				message: "WebSocket context creation failed.",
			});
			return;
		}

		webSocketServer.handleUpgrade(req, socket, head, (rawSocket) => {
			const routeSocket = createRouteWebSocket(rawSocket, matchedRoute.route);
			runWebSocketServiceHandler(
				matchedRoute.handler,
				{
					...validation.data,
					context,
					socket: routeSocket,
				},
				routeSocket,
			);
		});
	});
};
