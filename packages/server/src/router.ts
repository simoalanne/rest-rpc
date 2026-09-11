import type {
	RouteDeclaration,
	ServerErrors,
	ServerRequest,
	ServerResponse,
	ServerSuccessBody,
} from "@rest-rpc/core/contract";
import { REQUEST_CONTEXT_KEY } from "@rest-rpc/core/contract";

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
 * Infers the shorthand successful response body for an HTTP route.
 *
 * @see {@link https://rest-rpc.dev/docs/type-helpers#server}
 */
export type RouteResponseShorthand<E extends RouteDeclaration> =
	ServerSuccessBody<E>;

/**
 * Infers the declared non-success responses for an HTTP route.
 *
 * @see {@link https://rest-rpc.dev/docs/type-helpers#server}
 */
export type RouteErrors<E extends RouteDeclaration> = ServerErrors<E>;

/**
 * Infers the explicit response union for an HTTP route.
 *
 * @see {@link https://rest-rpc.dev/docs/type-helpers#server}
 */
export type RouteResponse<E extends RouteDeclaration> = ServerResponse<E>;

type RequestValue<E extends RouteDeclaration> =
	RouteRequestData<E> extends never ? EmptyObject : RouteRequestData<E>;

type ExcludeResponseEnvelopeLike<T> = T extends unknown
	? T extends Record<string, unknown>
		? "status" extends keyof T
			? never
			: T
		: T
	: never;

type HandlerResult<E extends RouteDeclaration> = MaybePromise<
	RouteResponse<E> | ExcludeResponseEnvelopeLike<RouteResponseShorthand<E>>
>;

type HttpRouteRequest<
	E extends RouteDeclaration,
	TContext extends HttpRouteHandlerContext,
> = Merge<
	RequestValue<E> & {
		[REQUEST_CONTEXT_KEY]: TContext;
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
> = HttpRouteRequest<E, TContext>;

type HttpRouteHandler<
	E extends RouteDeclaration,
	TContext extends HttpRouteHandlerContext,
> = (...args: [request: HttpRouteRequest<E, TContext>]) => HandlerResult<E>;

/**
 * Infers the route handler function type for a route declaration.
 *
 * @see {@link https://rest-rpc.dev/docs/type-helpers#server}
 */
export type RouteHandler<
	E extends RouteDeclaration,
	TContext extends HttpRouteHandlerContext = HttpRouteHandlerContext,
> = HttpRouteHandler<E, TContext>;

/**
 * A server implementation contract tree restricted to a route kind.
 *
 * @see {@link https://rest-rpc.dev/docs/advanced/building-server-adapters#registration-adapters}
 */
export type Contract = RouteDeclaration | { [key: string]: Contract };

/**
 * A runtime route implementation created by `route()` or `router()`.
 *
 * @see {@link https://rest-rpc.dev/docs/advanced/building-server-adapters#registration-adapters}
 */
export type RouteImplementation<
	TRoute = RouteDeclaration,
	THandler = RuntimeRouteHandler,
> = {
	route: TRoute;
	handler: THandler;
};

/**
 * A tree of route implementations matching a contract shape.
 *
 * @see {@link https://rest-rpc.dev/docs/advanced/building-server-adapters#registration-adapters}
 */
export type ImplementationTree =
	| RouteImplementation
	| { readonly [key: string]: ImplementationTree };

/**
 * Infers an implementation tree for a specific contract node.
 *
 * @see {@link https://rest-rpc.dev/docs/advanced/building-server-adapters#registration-adapters}
 */
export type ImplementationTreeFor<TNode extends Contract> =
	TNode extends RouteDeclaration
		? RouteImplementation<TNode>
		: {
				readonly [K in keyof TNode]: TNode[K] extends Contract
					? ImplementationTreeFor<TNode[K]>
					: never;
			};

/**
 * Infers the plain handler object shape for a contract tree.
 *
 * @see {@link https://rest-rpc.dev/docs/advanced/building-server-adapters#registration-adapters}
 */
export type ImplementationShape<
	TNode extends Contract,
	TContext extends HttpRouteHandlerContext = HttpRouteHandlerContext,
> = TNode extends RouteDeclaration
	? RouteHandler<TNode, TContext>
	: {
			[K in keyof TNode]: TNode[K] extends Contract
				? ImplementationShape<TNode[K], TContext>
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
	TNode extends Contract,
	TContext extends HttpRouteHandlerContext = HttpRouteHandlerContext,
> = TNode extends RouteDeclaration
	? RouteHandler<TNode, TContext> | RouteImplementation<TNode>
	: {
			[K in keyof TNode]: TNode[K] extends Contract
				? RouteHandlers<TNode[K], TContext>
				: never;
		};

export const isRouteDeclaration = (value: unknown): value is RouteDeclaration =>
	typeof value === "object" &&
	value !== null &&
	"path" in value &&
	"method" in value;

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
	contract: Contract,
	handlers: unknown,
	createRouteImplementation: CreateRouteImplementation,
	path: string[] = [],
	parent?: unknown,
): ImplementationTree => {
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
>(
	contract: TNode,
	handler: RouteHandler<TNode, TContext>,
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
	const TNode extends Contract,
	TContext extends HttpRouteHandlerContext = HttpRouteHandlerContext,
>(
	contract: TNode,
	handlers: RouteHandlers<TNode, TContext>,
	options: RouterOptions = {},
): ImplementationTreeFor<TNode> {
	return collectImplementations(
		contract,
		handlers,
		options.createRouteImplementation ??
			(({ route, handler }) => ({
				route,
				handler,
			})),
	) as ImplementationTreeFor<TNode>;
}
