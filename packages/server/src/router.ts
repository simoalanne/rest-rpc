import type {
	HttpRouteDeclaration,
	RouteDeclaration,
	ServerReceived,
	ServerRequest,
	ServerResponse,
	ServerSent,
	ServerSuccessBody,
	WebSocketRouteDeclaration,
} from "@rest-rpc/core/contract";
import { REQUEST_CONTEXT_KEY } from "@rest-rpc/core/contract";
import type { HttpHeaders } from "./headers.ts";

export type EmptyObject = Record<never, never>;
type MaybePromise<T> = T | Promise<T>;
type Merge<T> = {
	[K in keyof T]: T[K];
};
export type HttpRouteHandlerContext = Record<string, unknown>;
export type WebSocketRouteHandlerContext = Record<string, unknown>;

export type RuntimeRouteHandler = (
	request: unknown,
) => unknown | Promise<unknown>;
type AnyImplementationTree = ImplementationTree<RouteDeclaration>;

type RequestValue<E extends RouteDeclaration> =
	ServerRequest<E> extends never ? EmptyObject : ServerRequest<E>;

type HandlerResult<E extends HttpRouteDeclaration> = MaybePromise<
	(ServerResponse<E> & { headers?: HttpHeaders }) | ServerSuccessBody<E>
>;

export type ContractWebSocket<Send, Receive> = {
	send(message: Send): void;
	onMessage(callback: (message: Receive) => void | Promise<void>): () => void;
	onClose(
		callback: (event: CloseEventLike) => void | Promise<void>,
	): () => void;
	close(code?: number, reason?: string): void;
};

export type CloseEventLike = {
	code: number;
	reason?: string;
};

export type InferRouteHandlerRequest<
	E extends HttpRouteDeclaration,
	TContext extends HttpRouteHandlerContext = HttpRouteHandlerContext,
> = Merge<RequestValue<E> & { [REQUEST_CONTEXT_KEY]: TContext }>;

export type InferWebSocketRouteHandlerRequest<
	E extends WebSocketRouteDeclaration,
	TContext extends WebSocketRouteHandlerContext = WebSocketRouteHandlerContext,
> = Merge<
	RequestValue<E> & {
		[REQUEST_CONTEXT_KEY]: TContext & {
			socket: ContractWebSocket<ServerSent<E>, ServerReceived<E>>;
		};
	}
>;

export type InferRouteHandlerResponse<E extends HttpRouteDeclaration> =
	ServerResponse<E>;

export type RouteHandler<
	E extends HttpRouteDeclaration,
	TContext extends HttpRouteHandlerContext = HttpRouteHandlerContext,
> = (
	...args: [request: InferRouteHandlerRequest<E, TContext>]
) => HandlerResult<E>;

export type WebSocketRouteHandler<
	E extends WebSocketRouteDeclaration,
	TContext extends WebSocketRouteHandlerContext = WebSocketRouteHandlerContext,
> = (
	...args: [request: InferWebSocketRouteHandlerRequest<E, TContext>]
) => MaybePromise<void>;

export type Contract<TRoute extends RouteDeclaration = RouteDeclaration> =
	| TRoute
	| { [key: string]: Contract<TRoute> };

export type RouteImplementation<
	TRoute extends RouteDeclaration = RouteDeclaration,
> = {
	route: TRoute;
	handler: RuntimeRouteHandler;
};

export type ImplementationTree<
	TRoute extends RouteDeclaration = RouteDeclaration,
> =
	| RouteImplementation<TRoute>
	| { readonly [key: string]: ImplementationTree<TRoute> };

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

export type RouteHandlerFor<
	E extends RouteDeclaration,
	TContext extends HttpRouteHandlerContext = HttpRouteHandlerContext,
	TWebSocketContext extends
		WebSocketRouteHandlerContext = WebSocketRouteHandlerContext,
> = E extends HttpRouteDeclaration
	? RouteHandler<E, TContext>
	: E extends WebSocketRouteDeclaration
		? WebSocketRouteHandler<E, TWebSocketContext>
		: never;

export type ImplementationShape<
	TNode extends Contract<RouteDeclaration>,
	TContext extends HttpRouteHandlerContext = HttpRouteHandlerContext,
	TWebSocketContext extends
		WebSocketRouteHandlerContext = WebSocketRouteHandlerContext,
> = TNode extends RouteDeclaration
	? RouteHandlerFor<TNode, TContext, TWebSocketContext>
	: {
			[K in keyof TNode]: TNode[K] extends Contract<RouteDeclaration>
				? ImplementationShape<TNode[K], TContext, TWebSocketContext>
				: never;
		};

export type RouterImplementationInput<
	TNode extends Contract<RouteDeclaration>,
	TContext extends HttpRouteHandlerContext = HttpRouteHandlerContext,
	TWebSocketContext extends
		WebSocketRouteHandlerContext = WebSocketRouteHandlerContext,
> = TNode extends RouteDeclaration
	?
			| RouteHandlerFor<TNode, TContext, TWebSocketContext>
			| RouteImplementation<TNode>
	: {
			[K in keyof TNode]: TNode[K] extends Contract<RouteDeclaration>
				? RouterImplementationInput<TNode[K], TContext, TWebSocketContext>
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

export const isHttpRouteImplementation = (
	implementation: RouteImplementation,
): implementation is RouteImplementation<HttpRouteDeclaration> =>
	isHttpRoute(implementation.route);

export const isWebSocketRouteImplementation = (
	implementation: RouteImplementation,
): implementation is RouteImplementation<WebSocketRouteDeclaration> =>
	isWebSocketRoute(implementation.route);

export const isRouteImplementation = (
	value: unknown,
): value is RouteImplementation =>
	typeof value === "object" &&
	value !== null &&
	"route" in value &&
	"handler" in value;

type RouteValidator = (route: RouteDeclaration, routeName: string) => void;

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
	validateRoute: RouteValidator,
	path: string[] = [],
	parent?: unknown,
): AnyImplementationTree => {
	const routeName = path.join(".");

	if (isRouteDeclaration(contract)) {
		validateRoute(contract, routeName || contract.path);

		if (isRouteImplementation(handlers)) {
			validateRoute(handlers.route, routeName || handlers.route.path);
			assertMatchingRoute(contract, handlers.route, routeName || contract.path);
			return handlers;
		}

		if (typeof handlers !== "function") {
			throw new Error(`Resolved service for "${routeName}" is not a function`);
		}

		return {
			route: contract,
			handler:
				parent && typeof parent === "object" ? handlers.bind(parent) : handlers,
		};
	}

	if (!handlers || typeof handlers !== "object") {
		throw new Error(`Invalid implementation while resolving "${routeName}"`);
	}

	const handlerKeys = new Set(Object.keys(handlers));

	const tree = Object.fromEntries(
		Object.entries(contract).map(([key, childContract]) => {
			const childHandlers = (handlers as Record<string, unknown>)[key];
			const childPath = [...path, key];

			if (childHandlers === undefined) {
				throw new Error(`Missing service for route "${childPath.join(".")}"`);
			}

			handlerKeys.delete(key);

			return [
				key,
				collectImplementations(
					childContract,
					childHandlers,
					validateRoute,
					childPath,
					handlers,
				),
			];
		}),
	);

	if (handlerKeys.size > 0) {
		throw new Error(
			`Unexpected service for route "${[...path, ...handlerKeys].join(".")}"`,
		);
	}

	return tree;
};

export const route = <
	const TNode extends RouteDeclaration,
	TContext extends HttpRouteHandlerContext = HttpRouteHandlerContext,
	TWebSocketContext extends
		WebSocketRouteHandlerContext = WebSocketRouteHandlerContext,
>(
	contract: TNode,
	handler: RouteHandlerFor<TNode, TContext, TWebSocketContext>,
): RouteImplementation<TNode> => ({
	route: contract,
	handler: handler as RuntimeRouteHandler,
});

export const router = <
	const TNode extends Contract<RouteDeclaration>,
	TContext extends HttpRouteHandlerContext = HttpRouteHandlerContext,
	TWebSocketContext extends
		WebSocketRouteHandlerContext = WebSocketRouteHandlerContext,
>(
	contract: TNode,
	handlers: RouterImplementationInput<TNode, TContext, TWebSocketContext>,
): ImplementationTreeFor<TNode, RouteDeclaration> =>
	collectImplementations(contract, handlers, () => {}) as ImplementationTreeFor<
		TNode,
		RouteDeclaration
	>;
