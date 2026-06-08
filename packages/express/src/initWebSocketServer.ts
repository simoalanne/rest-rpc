import type { Server as HttpServer, IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";
import type {
	Contract,
	ContractClientMessage,
	ContractServerMessage,
	WebSocketContract,
} from "@contract-first-api/core/contracts";
import type { Request } from "express";
import type WebSocket from "ws";
import { WebSocketServer } from "ws";
import type { EmptyObject, ValidationResult } from "./initServer.ts";

export type WebSocketMessageResult<E extends WebSocketContract> =
	| { success: true; data: ContractClientMessage<E> }
	| { success: false };

export type ContractWebSocket<E extends WebSocketContract> = Omit<
	WebSocket,
	"send" | "on" | "off"
> & {
	send: (message: ContractServerMessage<E>) => void;
	onMessage: (
		callback: (result: WebSocketMessageResult<E>) => void,
	) => () => void;
	onClose: (callback: (code: number, reason: Buffer) => void) => () => void;
};

type KnownContractErrorShape = Error & {
	readonly error: Record<string, unknown>;
	readonly status: number;
};

type WebSocketRoute<TMeta> = WebSocketContract<TMeta> & {
	keySegments: string[];
};

type RegisterWebSocketRoutesOptions<TMeta, TContext> = {
	server: HttpServer;
	routes: Array<WebSocketRoute<TMeta>>;
	services: unknown;
	routePrefix?: string;
	createContext?: (
		req: Request & { contract: Contract<TMeta> },
	) => TContext | Promise<TContext>;
	buildRoutePath: (routePrefix: string | undefined, path: string) => string;
	createPathMatcher: (
		path: string,
	) => (pathname: string) => Record<string, string> | null;
	resolveHandlerAtPath: <THandler extends (...args: unknown[]) => unknown>(
		handlers: unknown,
		keySegments: string[],
	) => THandler;
	validateRequestSegments: (
		contract: Contract,
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

const createContractWebSocket = <E extends WebSocketContract>(
	socket: WebSocket,
	contract: E,
): ContractWebSocket<E> => {
	const rawSend = socket.send.bind(socket);
	const contractSocket = socket as unknown as ContractWebSocket<E>;

	const parseIncomingMessage = (data: unknown): WebSocketMessageResult<E> => {
		try {
			return {
				success: true,
				data: contract.messages.client.parse(
					JSON.parse(String(data)),
				) as ContractClientMessage<E>,
			};
		} catch {
			return { success: false };
		}
	};

	contractSocket.send = (message: ContractServerMessage<E>) => {
		rawSend(JSON.stringify(message));
	};

	contractSocket.onMessage = (callback) => {
		const onMessage = (data: WebSocket.RawData) => {
			callback(parseIncomingMessage(data));
		};

		socket.on("message", onMessage);
		return () => socket.off("message", onMessage);
	};

	contractSocket.onClose = (callback) => {
		socket.on("close", callback);
		return () => socket.off("close", callback);
	};

	return contractSocket;
};

export const registerWebSocketRoutes = <TMeta, TContext>({
	server,
	routes,
	services,
	routePrefix,
	createContext,
	buildRoutePath,
	createPathMatcher,
	resolveHandlerAtPath,
	validateRequestSegments,
	isKnownContractError,
}: RegisterWebSocketRoutesOptions<TMeta, TContext>) => {
	if (routes.length === 0) return;

	const webSocketServer = new WebSocketServer({ noServer: true });
	const routeMatchers = routes.map((route) => ({
		route,
		match: createPathMatcher(buildRoutePath(routePrefix, route.path)),
		handler: resolveHandlerAtPath<
			(request: unknown) => unknown | Promise<unknown>
		>(services, route.keySegments),
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
			contract: Contract<TMeta>;
			validatedRequest: Record<string, unknown>;
		};
		upgradeRequest.contract = matchedRoute.route;
		upgradeRequest.validatedRequest = validation.data;

		let context: TContext | EmptyObject = {};
		try {
			context =
				(await createContext?.(
					upgradeRequest as unknown as Request & {
						contract: Contract<TMeta>;
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
			const contractSocket = createContractWebSocket(
				rawSocket,
				matchedRoute.route,
			);
			void Promise.resolve(
				matchedRoute.handler({
					...validation.data,
					context,
					socket: contractSocket,
				}),
			).catch(() => {
				contractSocket.close(1011, "WebSocket service failed.");
			});
		});
	});
};
