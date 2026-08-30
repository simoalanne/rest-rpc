import type {
	HttpRouteDeclaration,
	RouteDeclaration,
	ServerErrors,
	ServerReceived,
	ServerRequest,
	ServerResponse,
	ServerSent,
	ServerSseSent,
	ServerSuccessBody,
	WebSocketRouteDeclaration,
} from "@rest-rpc/core/contract";
import { REQUEST_CONTEXT_KEY } from "@rest-rpc/core/contract";
import type { HttpHeaders } from "./headers.ts";
import type { SseEvent } from "./sse.ts";

export type EmptyObject = Record<never, never>;
type MaybePromise<T> = T | Promise<T>;
type Merge<T> = {
	[K in keyof T]: T[K];
};

/**
 * Base context object accepted by HTTP route handlers.
 *
 * @see {@link https://rest-rpc.dev/docs/type-helpers#server}
 */
export type HttpRouteHandlerContext = Record<string, unknown>;

/**
 * Base context object accepted by WebSocket route handlers.
 *
 * @see {@link https://rest-rpc.dev/docs/type-helpers#server}
 */
export type WebSocketRouteHandlerContext = Record<string, unknown>;

/**
 * Base context fields available to SSE route handlers.
 *
 * @see {@link https://rest-rpc.dev/docs/type-helpers#server}
 */
export type SseRouteHandlerContext = {
	lastEventId?: string;
};

/**
 * Untyped route handler shape stored in runtime route implementations.
 *
 * @see {@link https://rest-rpc.dev/docs/advanced/building-server-adapters#registration-adapters}
 */
export type RuntimeRouteHandler = (
	request: unknown,
) => unknown | Promise<unknown>;

/**
 * Infers the validated request data for a route declaration.
 *
 * @see {@link https://rest-rpc.dev/docs/type-helpers#server}
 */
export type RouteRequestData<E extends RouteDeclaration> = ServerRequest<E>;

/**
 * Infers the message type a server can send on a WebSocket route.
 *
 * @see {@link https://rest-rpc.dev/docs/type-helpers#server}
 */
export type RouteSent<E extends WebSocketRouteDeclaration> = ServerSent<E>;

/**
 * Infers the message type a server receives from a WebSocket route.
 *
 * @see {@link https://rest-rpc.dev/docs/type-helpers#server}
 */
export type RouteReceived<E extends WebSocketRouteDeclaration> =
	ServerReceived<E>;

/**
 * Infers the shorthand successful response body for an HTTP route.
 *
 * @see {@link https://rest-rpc.dev/docs/type-helpers#server}
 */
export type RouteResponseShorthand<E extends HttpRouteDeclaration> =
	ServerSuccessBody<E>;

/**
 * Infers the declared non-success responses for an HTTP route.
 *
 * @see {@link https://rest-rpc.dev/docs/type-helpers#server}
 */
export type RouteErrors<E extends HttpRouteDeclaration> = ServerErrors<E>;

/**
 * Infers the explicit response union for an HTTP route.
 *
 * @see {@link https://rest-rpc.dev/docs/type-helpers#server}
 */
export type RouteResponse<E extends HttpRouteDeclaration> = ServerResponse<E>;

/**
 * Infers the event payload type a server sends from an SSE route.
 *
 * @see {@link https://rest-rpc.dev/docs/type-helpers#server-sent-events}
 */
export type RouteSseSent<E extends HttpRouteDeclaration> = ServerSseSent<E>;

type RequestValue<E extends RouteDeclaration> =
	RouteRequestData<E> extends never ? EmptyObject : RouteRequestData<E>;

type ExcludeResponseEnvelopeLike<T> = T extends unknown
	? T extends Record<string, unknown>
		? "status" extends keyof T
			? never
			: T
		: T
	: never;

type HandlerResult<E extends HttpRouteDeclaration> = MaybePromise<
	| (RouteResponse<E> & { headers?: HttpHeaders })
	| ExcludeResponseEnvelopeLike<RouteResponseShorthand<E>>
>;

type SseHandlerResult<E extends HttpRouteDeclaration> = MaybePromise<
	AsyncIterable<SseEvent<RouteSseSent<E>>>
>;

type RouteHandlerResult<E extends HttpRouteDeclaration> = E extends {
	mode: "sse";
}
	? SseHandlerResult<E>
	: HandlerResult<E>;

/**
 * The typed socket available in a WebSocket route handler context.
 *
 * @see {@link https://rest-rpc.dev/docs/type-helpers#server}
 */
export type RouteSocket<E extends WebSocketRouteDeclaration> = {
	send(message: RouteSent<E>): void;
	onMessage(
		callback: (message: RouteReceived<E>) => void | Promise<void>,
	): () => void;
	onClose(
		callback: (event: CloseEventLike) => void | Promise<void>,
	): () => void;
	close(code?: number, reason?: string): void;
};

/**
 * Minimal close event shape passed to WebSocket route close handlers.
 *
 * @see {@link https://rest-rpc.dev/docs/websockets#server}
 */
export type CloseEventLike = {
	code: number;
	reason?: string;
};

type HttpRouteRequest<
	E extends HttpRouteDeclaration,
	TContext extends HttpRouteHandlerContext,
> = Merge<
	RequestValue<E> & {
		[REQUEST_CONTEXT_KEY]: E extends { mode: "sse" }
			? TContext & SseRouteHandlerContext
			: TContext;
	}
>;

type WebSocketRouteRequest<
	E extends WebSocketRouteDeclaration,
	TContext extends WebSocketRouteHandlerContext,
> = Merge<
	RequestValue<E> & {
		[REQUEST_CONTEXT_KEY]: TContext & {
			socket: RouteSocket<E>;
		};
	}
>;

/**
 * Infers the route handler request type for a route declaration.
 *
 * @see {@link https://rest-rpc.dev/docs/type-helpers#server}
 */
export type RouteRequest<
	E extends RouteDeclaration,
	TContext extends HttpRouteHandlerContext = HttpRouteHandlerContext,
> = E extends HttpRouteDeclaration
	? HttpRouteRequest<E, TContext>
	: E extends WebSocketRouteDeclaration
		? WebSocketRouteRequest<E, TContext>
		: never;

type HttpRouteHandler<
	E extends HttpRouteDeclaration,
	TContext extends HttpRouteHandlerContext,
> = (
	...args: [request: HttpRouteRequest<E, TContext>]
) => RouteHandlerResult<E>;

type WebSocketRouteHandler<
	E extends WebSocketRouteDeclaration,
	TContext extends WebSocketRouteHandlerContext,
> = (
	...args: [request: WebSocketRouteRequest<E, TContext>]
) => MaybePromise<void>;

/**
 * Infers the route handler function type for a route declaration.
 *
 * @see {@link https://rest-rpc.dev/docs/type-helpers#server}
 */
export type RouteHandler<
	E extends RouteDeclaration,
	TContext extends HttpRouteHandlerContext = HttpRouteHandlerContext,
> = E extends HttpRouteDeclaration
	? HttpRouteHandler<E, TContext>
	: E extends WebSocketRouteDeclaration
		? WebSocketRouteHandler<E, TContext>
		: never;

/**
 * A server implementation contract tree restricted to a route kind.
 *
 * @see {@link https://rest-rpc.dev/docs/advanced/building-server-adapters#registration-adapters}
 */
export type Contract<TRoute extends RouteDeclaration = RouteDeclaration> =
	| TRoute
	| { [key: string]: Contract<TRoute> };

/**
 * A runtime route implementation created by `route()` or `router()`.
 *
 * @see {@link https://rest-rpc.dev/docs/advanced/building-server-adapters#registration-adapters}
 */
export type RouteImplementation<
	TRoute extends RouteDeclaration = RouteDeclaration,
> = {
	route: TRoute;
	handler: RuntimeRouteHandler;
};

/**
 * A tree of route implementations matching a contract shape.
 *
 * @see {@link https://rest-rpc.dev/docs/advanced/building-server-adapters#registration-adapters}
 */
export type ImplementationTree<
	TRoute extends RouteDeclaration = RouteDeclaration,
> =
	| RouteImplementation<TRoute>
	| { readonly [key: string]: ImplementationTree<TRoute> };

/**
 * Infers an implementation tree for a specific contract node.
 *
 * @see {@link https://rest-rpc.dev/docs/advanced/building-server-adapters#registration-adapters}
 */
export type ImplementationTreeFor<
	TNode extends Contract<TRoute>,
	TRoute extends RouteDeclaration = RouteDeclaration,
> = TNode extends TRoute
	? RouteImplementation<TNode>
	: {
			readonly [K in keyof TNode]: TNode[K] extends Contract<TRoute>
				? ImplementationTreeFor<TNode[K], TRoute>
				: never;
		};

/**
 * Selects the HTTP or WebSocket handler type for a route declaration.
 *
 * @see {@link https://rest-rpc.dev/docs/type-helpers#server}
 */
export type RouteHandlerFor<
	E extends RouteDeclaration,
	TContext extends HttpRouteHandlerContext = HttpRouteHandlerContext,
	TWebSocketContext extends WebSocketRouteHandlerContext =
		WebSocketRouteHandlerContext,
> = E extends HttpRouteDeclaration
	? RouteHandler<E, TContext>
	: E extends WebSocketRouteDeclaration
		? RouteHandler<E, TWebSocketContext>
		: never;

/**
 * Infers the plain handler object shape for a contract tree.
 *
 * @see {@link https://rest-rpc.dev/docs/advanced/building-server-adapters#registration-adapters}
 */
export type ImplementationShape<
	TNode extends Contract<RouteDeclaration>,
	TContext extends HttpRouteHandlerContext = HttpRouteHandlerContext,
	TWebSocketContext extends WebSocketRouteHandlerContext =
		WebSocketRouteHandlerContext,
> = TNode extends RouteDeclaration
	? RouteHandlerFor<TNode, TContext, TWebSocketContext>
	: {
			[K in keyof TNode]: TNode[K] extends Contract<RouteDeclaration>
				? ImplementationShape<TNode[K], TContext, TWebSocketContext>
				: never;
		};

/**
 * Handler tree accepted by `router()` when building an implementation tree.
 *
 * @remarks Use this type with `implements` to check class-based route handler
 * services against a contract tree.
 *
 * @example
 * ```ts
 * class TodoHandlers implements RouteHandlers<typeof api.todos> {
 *   get(request: RouteRequest<typeof api.todos.get>) {
 *     return { id: request.id };
 *   }
 * }
 * ```
 *
 * @see {@link https://rest-rpc.dev/docs/recipes/organizing-route-handlers#service-classes-as-handlers}
 */
export type RouteHandlers<
	TNode extends Contract<RouteDeclaration>,
	TContext extends HttpRouteHandlerContext = HttpRouteHandlerContext,
	TWebSocketContext extends WebSocketRouteHandlerContext =
		WebSocketRouteHandlerContext,
> = TNode extends RouteDeclaration
	?
			| RouteHandlerFor<TNode, TContext, TWebSocketContext>
			| RouteImplementation<TNode>
	: {
			[K in keyof TNode]: TNode[K] extends Contract<RouteDeclaration>
				? RouteHandlers<TNode[K], TContext, TWebSocketContext>
				: never;
		};

export const isRouteDeclaration = (value: unknown): value is RouteDeclaration =>
	typeof value === "object" &&
	value !== null &&
	"path" in value &&
	"method" in value;

export const isHttpRoute = (
	route: RouteDeclaration,
): route is HttpRouteDeclaration => "responses" in route;

export const isWebSocketRoute = (
	route: RouteDeclaration,
): route is WebSocketRouteDeclaration => route.mode === "webSocket";

/**
 * Checks whether a route implementation handles an HTTP route.
 *
 * @see {@link https://rest-rpc.dev/docs/advanced/building-server-adapters#splitting-implementations}
 */
export function isHttpRouteImplementation(
	implementation: RouteImplementation,
): implementation is RouteImplementation<HttpRouteDeclaration> {
	return isHttpRoute(implementation.route);
}

/**
 * Checks whether a route implementation handles a WebSocket route.
 *
 * @see {@link https://rest-rpc.dev/docs/advanced/building-server-adapters#splitting-implementations}
 */
export function isWebSocketRouteImplementation(
	implementation: RouteImplementation,
): implementation is RouteImplementation<WebSocketRouteDeclaration> {
	return isWebSocketRoute(implementation.route);
}

export const isRouteImplementation = (
	value: unknown,
): value is RouteImplementation =>
	typeof value === "object" &&
	value !== null &&
	"route" in value &&
	"handler" in value;

type CreateRouteImplementationInput = {
	route: RouteDeclaration;
	handler: RuntimeRouteHandler;
	routeName: string;
};

type CreateRouteImplementation = (
	input: CreateRouteImplementationInput,
) => RouteImplementation<RouteDeclaration>;

type RouterOptions = {
	createRouteImplementation?: CreateRouteImplementation;
};

const assertMatchingRoute = (
	expected: RouteDeclaration,
	actual: RouteDeclaration,
	routeName: string,
) => {
	if (actual.method !== expected.method || actual.path !== expected.path) {
		throw new Error(
			`Implementation for route "${routeName}" does not match the contract route.`,
		);
	}
};

const collectImplementations = (
	contract: Contract<RouteDeclaration>,
	handlers: unknown,
	createRouteImplementation: CreateRouteImplementation,
	path: string[] = [],
	parent?: unknown,
): ImplementationTree<RouteDeclaration> => {
	const routeName = path.join(".");

	if (isRouteDeclaration(contract)) {
		if (isRouteImplementation(handlers)) {
			assertMatchingRoute(contract, handlers.route, routeName || contract.path);
			return handlers;
		}

		if (typeof handlers !== "function") {
			throw new Error(`Resolved service for "${routeName}" is not a function`);
		}

		return createRouteImplementation({
			route: contract,
			handler:
				parent && typeof parent === "object" ? handlers.bind(parent) : handlers,
			routeName: routeName || contract.path,
		});
	}

	if (!handlers || typeof handlers !== "object") {
		throw new Error(`Invalid implementation while resolving "${routeName}"`);
	}

	const tree = Object.fromEntries(
		Object.entries(contract).map(([key, childContract]) => {
			const childHandlers = (handlers as Record<string, unknown>)[key];
			const childPath = [...path, key];

			if (childHandlers === undefined) {
				throw new Error(`Missing service for route "${childPath.join(".")}"`);
			}

			return [
				key,
				collectImplementations(
					childContract,
					childHandlers,
					createRouteImplementation,
					childPath,
					handlers,
				),
			];
		}),
	);

	return tree;
};

/**
 * Builds a route implementation for a single contract route.
 *
 * @see {@link https://rest-rpc.dev/docs/advanced/building-server-adapters#registration-adapters}
 */
export function route<
	const TNode extends RouteDeclaration,
	TContext extends HttpRouteHandlerContext = HttpRouteHandlerContext,
	TWebSocketContext extends WebSocketRouteHandlerContext =
		WebSocketRouteHandlerContext,
>(
	contract: TNode,
	handler: RouteHandlerFor<TNode, TContext, TWebSocketContext>,
): RouteImplementation<TNode> {
	return {
		route: contract,
		handler: handler as RuntimeRouteHandler,
	};
}

/**
 * Builds an implementation tree for a contract.
 *
 * @see {@link https://rest-rpc.dev/docs/advanced/building-server-adapters#registration-adapters}
 */
export function router<
	const TNode extends Contract<RouteDeclaration>,
	TContext extends HttpRouteHandlerContext = HttpRouteHandlerContext,
	TWebSocketContext extends WebSocketRouteHandlerContext =
		WebSocketRouteHandlerContext,
>(
	contract: TNode,
	handlers: RouteHandlers<TNode, TContext, TWebSocketContext>,
	options: RouterOptions = {},
): ImplementationTreeFor<TNode, RouteDeclaration> {
	return collectImplementations(
		contract,
		handlers,
		options.createRouteImplementation ??
			(({ route, handler }) => ({
				route,
				handler,
			})),
	) as ImplementationTreeFor<TNode, RouteDeclaration>;
}
