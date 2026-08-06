import type { OutgoingHttpHeader } from "node:http";
import type {
	HttpRouteDeclaration,
	InferServerRequest,
	InferServerResponse,
	InferServerSuccessBody,
	RouteDeclaration,
} from "@contract-first-api/core/contract";
import { REQUEST_CONTEXT_KEY } from "@contract-first-api/core/contract";

export type EmptyObject = Record<never, never>;
type MaybePromise<T> = T | Promise<T>;
type Merge<T> = {
	[K in keyof T]: T[K];
};
export type HttpRouteHandlerContext = Record<string, unknown>;

export type RuntimeRouteHandler = (
	request: unknown,
) => unknown | Promise<unknown>;
type AnyImplementationTree = ImplementationTree<RouteDeclaration>;

type RequestValue<E extends RouteDeclaration> =
	InferServerRequest<E> extends never ? EmptyObject : InferServerRequest<E>;

type HandlerResult<E extends HttpRouteDeclaration> = MaybePromise<
	| (InferServerResponse<E> & { headers?: Record<string, OutgoingHttpHeader> })
	| InferServerSuccessBody<E>
>;

export type InferRouteHandlerRequest<
	E extends HttpRouteDeclaration,
	TContext extends HttpRouteHandlerContext = HttpRouteHandlerContext,
> = Merge<RequestValue<E> & { [REQUEST_CONTEXT_KEY]: TContext }>;

export type InferRouteHandlerResponse<E extends HttpRouteDeclaration> =
	InferServerResponse<E>;

export type RouteHandler<
	E extends HttpRouteDeclaration,
	TContext extends HttpRouteHandlerContext = HttpRouteHandlerContext,
> = (
	...args: [request: InferRouteHandlerRequest<E, TContext>]
) => HandlerResult<E>;

export type Contract<TRoute extends RouteDeclaration = HttpRouteDeclaration> =
	| TRoute
	| { [key: string]: Contract<TRoute> };

export type RouteImplementation<
	TRoute extends RouteDeclaration = HttpRouteDeclaration,
> = {
	route: TRoute;
	handler: RuntimeRouteHandler;
};

export type ImplementationTree<
	TRoute extends RouteDeclaration = HttpRouteDeclaration,
> =
	| RouteImplementation<TRoute>
	| { readonly [key: string]: ImplementationTree<TRoute> };

export type ImplementationTreeFor<
	TNode extends Contract<TRoute>,
	TRoute extends RouteDeclaration = HttpRouteDeclaration,
> = TNode extends TRoute
	? RouteImplementation<TNode>
	: {
			readonly [K in keyof TNode]: TNode[K] extends Contract<TRoute>
				? ImplementationTreeFor<TNode[K], TRoute>
				: never;
		};

export type ImplementationShape<
	TNode extends Contract<HttpRouteDeclaration>,
	TContext extends HttpRouteHandlerContext = HttpRouteHandlerContext,
> = TNode extends HttpRouteDeclaration
	? RouteHandler<TNode, TContext>
	: {
			[K in keyof TNode]: TNode[K] extends Contract<HttpRouteDeclaration>
				? ImplementationShape<TNode[K], TContext>
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

export const isRouteImplementation = (
	value: unknown,
): value is RouteImplementation =>
	typeof value === "object" &&
	value !== null &&
	"route" in value &&
	"handler" in value;

type RouteValidator = (route: RouteDeclaration, routeName: string) => void;

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

const validateImplementations = (
	contract: Contract<RouteDeclaration>,
	implementation: unknown,
	validateRoute: RouteValidator,
	path: string[] = [],
): AnyImplementationTree => {
	const routeName = path.join(".");

	if (isRouteDeclaration(contract)) {
		validateRoute(contract, routeName || contract.path);

		if (!isRouteImplementation(implementation)) {
			throw new Error(`Missing implementation for route "${routeName}"`);
		}

		validateRoute(implementation.route, routeName || implementation.route.path);
		assertMatchingRoute(
			contract,
			implementation.route,
			routeName || contract.path,
		);
		return implementation;
	}

	if (!implementation || typeof implementation !== "object") {
		throw new Error(`Invalid implementation while resolving "${routeName}"`);
	}

	const entries = Object.entries(contract);
	const implementationKeys = new Set(Object.keys(implementation));

	const tree = Object.fromEntries(
		entries.map(([key, childContract]) => {
			const childImplementation = (implementation as Record<string, unknown>)[
				key
			];
			const childPath = [...path, key];

			if (childImplementation === undefined) {
				throw new Error(
					`Missing implementation for route "${childPath.join(".")}"`,
				);
			}

			implementationKeys.delete(key);

			return [
				key,
				validateImplementations(
					childContract,
					childImplementation,
					validateRoute,
					childPath,
				),
			];
		}),
	);

	if (implementationKeys.size > 0) {
		throw new Error(
			`Unexpected implementation for route "${[
				...path,
				...implementationKeys,
			].join(".")}"`,
		);
	}

	return tree;
};

const isImplementationTree = (
	node: unknown,
	validateRoute: RouteValidator,
): node is AnyImplementationTree => {
	if (isRouteImplementation(node)) {
		validateRoute(node.route, node.route.path);
		return true;
	}
	if (!node || typeof node !== "object" || isRouteDeclaration(node)) {
		return false;
	}
	return Object.values(node).every((child) =>
		isImplementationTree(child, validateRoute),
	);
};

export const createRouterBuilders = (
	validateRoute: RouteValidator,
	routerName: string,
) => ({
	route: (contract: RouteDeclaration, handler: RuntimeRouteHandler) => {
		validateRoute(contract, contract.path);
		return {
			route: contract,
			handler,
		};
	},
	router: (contract: Contract<RouteDeclaration>, handlers: unknown) =>
		collectImplementations(contract, handlers, validateRoute),
	routes: (contract: Contract<RouteDeclaration>, implementations: unknown) => {
		if (!isImplementationTree(implementations, validateRoute)) {
			throw new Error(
				`${routerName}() requires an implementation tree to validate.`,
			);
		}

		return validateImplementations(contract, implementations, validateRoute);
	},
});

const httpRouterBuilders = createRouterBuilders((route, routeName) => {
	if (!isHttpRoute(route)) {
		throw new Error(
			`HTTP route builders only support HTTP routes. Received non-HTTP route "${routeName || route.path}".`,
		);
	}
}, "router");

export const route = <
	const TNode extends HttpRouteDeclaration,
	TContext extends HttpRouteHandlerContext = HttpRouteHandlerContext,
>(
	contract: TNode,
	handler: RouteHandler<TNode, TContext>,
): RouteImplementation<TNode> =>
	httpRouterBuilders.route(
		contract,
		handler as RuntimeRouteHandler,
	) as RouteImplementation<TNode>;

export const router = <
	const TNode extends Contract<HttpRouteDeclaration>,
	TContext extends HttpRouteHandlerContext = HttpRouteHandlerContext,
>(
	contract: TNode,
	handlers: ImplementationShape<TNode, TContext>,
): ImplementationTreeFor<TNode, HttpRouteDeclaration> =>
	httpRouterBuilders.router(contract, handlers) as ImplementationTreeFor<
		TNode,
		HttpRouteDeclaration
	>;

export const routes = <const TNode extends Contract<HttpRouteDeclaration>>(
	contract: TNode,
	implementations: ImplementationTreeFor<TNode, HttpRouteDeclaration>,
): ImplementationTreeFor<TNode, HttpRouteDeclaration> =>
	httpRouterBuilders.routes(contract, implementations) as ImplementationTreeFor<
		TNode,
		HttpRouteDeclaration
	>;
