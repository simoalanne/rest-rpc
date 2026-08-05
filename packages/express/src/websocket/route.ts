import type { IncomingMessage } from "node:http";
import type {
	InferRouteRequest,
	WebSocketRouteDeclaration,
} from "@contract-first-api/core/contract";
import {
	type Contract,
	createRouterBuilders,
	type ImplementationTree,
	type ImplementationTreeFor,
	type RouteImplementation,
} from "../server/router.ts";
import type { InferRouteServerSocket } from "./socket.ts";

type EmptyObject = Record<never, never>;
type MaybePromise<T> = T | Promise<T>;
type Merge<T> = {
	[K in keyof T]: T[K];
};

type RequestValue<E extends WebSocketRouteDeclaration> =
	InferRouteRequest<E> extends never ? EmptyObject : InferRouteRequest<E>;

export type InferWebSocketRouteHandlerRequest<
	E extends WebSocketRouteDeclaration,
> = Merge<RequestValue<E> & { context: WebSocketRouteHandlerContext<E> }>;

export type WebSocketRouteHandlerContext<
	E extends WebSocketRouteDeclaration = WebSocketRouteDeclaration,
> = {
	req: IncomingMessage;
	socket: InferRouteServerSocket<E>;
};

export type WebSocketRouteHandler<E extends WebSocketRouteDeclaration> = (
	request: InferWebSocketRouteHandlerRequest<E>,
) => MaybePromise<void>;

export type WebSocketRouteImplementation<
	E extends WebSocketRouteDeclaration = WebSocketRouteDeclaration,
> = RouteImplementation<E>;

export type WebSocketImplementationTree =
	ImplementationTree<WebSocketRouteDeclaration>;

type WebSocketImplementationShape<
	TNode extends Contract<WebSocketRouteDeclaration>,
> = TNode extends WebSocketRouteDeclaration
	? WebSocketRouteHandler<TNode>
	: {
			[K in keyof TNode]: TNode[K] extends Contract<WebSocketRouteDeclaration>
				? WebSocketImplementationShape<TNode[K]>
				: never;
		};

const webSocketRouterBuilders = createRouterBuilders((route, routeName) => {
	if (route.options?.mode !== "websocket") {
		throw new Error(
			`WebSocket route builders only support websocket routes. Received non-websocket route "${routeName}".`,
		);
	}
}, "webSocketRouter");

export const webSocketRoute = <const TNode extends WebSocketRouteDeclaration>(
	contract: TNode,
	handler: WebSocketRouteHandler<TNode>,
): RouteImplementation<TNode> =>
	webSocketRouterBuilders.route(
		contract,
		handler as RouteImplementation["handler"],
	) as RouteImplementation<TNode>;

export const webSocketRouter = <
	const TNode extends Contract<WebSocketRouteDeclaration>,
>(
	contract: TNode,
	handlers: WebSocketImplementationShape<TNode>,
): ImplementationTreeFor<TNode, WebSocketRouteDeclaration> =>
	webSocketRouterBuilders.router(contract, handlers) as ImplementationTreeFor<
		TNode,
		WebSocketRouteDeclaration
	>;

export const webSocketRoutes = <
	const TNode extends Contract<WebSocketRouteDeclaration>,
>(
	contract: TNode,
	implementations: ImplementationTreeFor<TNode, WebSocketRouteDeclaration>,
): ImplementationTreeFor<TNode, WebSocketRouteDeclaration> =>
	webSocketRouterBuilders.routes(
		contract,
		implementations,
	) as ImplementationTreeFor<TNode, WebSocketRouteDeclaration>;
