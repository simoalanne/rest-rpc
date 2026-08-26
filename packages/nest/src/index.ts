import type { HttpRouteDeclaration } from "@rest-rpc/core/contract";
import {
	type Contract,
	type ImplementationTree,
	type ImplementationTreeFor,
	type RouteImplementation,
	type RouteHandler as ServerRouteHandler,
	type RouteRequest as ServerRouteRequest,
	route as serverRoute,
	router as serverRouter,
} from "@rest-rpc/server";
import type { DefaultNestContext, NestHandlerContext } from "./module.ts";

export type {
	ClearCookieOptions,
	RouteErrors,
	RouteResponse,
	RouteResponseShorthand,
	SetCookieOptions,
} from "@rest-rpc/server";
export { clearCookie, RouteResponseError, setCookie } from "@rest-rpc/server";
export { Route, Router } from "./decorators.ts";
export type {
	DefaultNestContext,
	NestHandlerContext,
	RestRpcModuleOptions,
} from "./module.ts";
export { RestRpcModule } from "./module.ts";

/**
 * A contract tree containing only HTTP routes for the Nest adapter.
 *
 * @remarks The Nest adapter currently registers HTTP routes through Nest
 * controllers. Use this helper to constrain router contracts passed to
 * `router()` and `RouteHandlers`.
 *
 * @see {@link https://rest-rpc.dev/docs/server/nest}
 */
export type NestContract = Contract<HttpRouteDeclaration>;

type AdditionalNestContext<TContext extends Record<string, unknown>> =
	DefaultNestContext & TContext;

/**
 * Infers the Nest route handler request type for a given route declaration.
 *
 * @remarks The inferred request includes the route input fields and a
 * Nest-specific `context` property. Pass the second generic argument for
 * controller-local context values added by `router(..., { context })`.
 *
 * @see {@link https://rest-rpc.dev/docs/type-helpers#server}
 * @see {@link https://rest-rpc.dev/docs/server/nest#controller-local-context}
 */
export type RouteRequest<
	E extends HttpRouteDeclaration,
	TAdditionalContext extends Record<string, unknown> = Record<never, never>,
> = ServerRouteRequest<
	E,
	NestHandlerContext<AdditionalNestContext<TAdditionalContext>>
>;

/**
 * Infers the Nest route handler type for a given route declaration.
 *
 * @remarks Use this type when annotating reusable handler functions for a
 * single route. The handler receives the same context shape used by
 * `RouteRequest`.
 *
 * @see {@link https://rest-rpc.dev/docs/type-helpers#server}
 * @see {@link https://rest-rpc.dev/docs/server/nest#framework-context}
 */
export type RouteHandler<
	E extends HttpRouteDeclaration,
	TAdditionalContext extends Record<string, unknown> = Record<never, never>,
> = ServerRouteHandler<
	E,
	NestHandlerContext<AdditionalNestContext<TAdditionalContext>>
>;

type BivariantRouteHandler<E extends HttpRouteDeclaration> = {
	handler(...args: Parameters<RouteHandler<E>>): ReturnType<RouteHandler<E>>;
}["handler"];

/**
 * Handler tree accepted by `router()` when building a Nest implementation tree.
 *
 * @remarks Use this type with `implements` to check injectable Nest provider
 * classes against a contract tree.
 *
 * @example
 * ```ts
 * @Injectable()
 * class TodoHandlers implements RouteHandlers<typeof api.todos> {
 *   get(request: RouteRequest<typeof api.todos.get>) {
 *     return { id: request.id };
 *   }
 * }
 * ```
 *
 * @see {@link https://rest-rpc.dev/docs/server/nest#usage}
 */
export type RouteHandlers<TContract extends NestContract> =
	TContract extends HttpRouteDeclaration
		? BivariantRouteHandler<TContract> | RouteImplementation<TContract>
		: {
				[K in keyof TContract]: TContract[K] extends NestContract
					? RouteHandlers<TContract[K]>
					: never;
			};

const isNestRouteImplementation = (
	value: unknown,
): value is RouteImplementation<HttpRouteDeclaration> =>
	typeof value === "object" &&
	value !== null &&
	"route" in value &&
	"handler" in value;

const attachNestRouteContext = <
	TImplementation extends ImplementationTree<HttpRouteDeclaration>,
>(
	implementation: TImplementation,
	context: Record<string, unknown> | undefined,
): TImplementation => {
	if (context === undefined) return implementation;

	if (isNestRouteImplementation(implementation)) {
		return {
			...implementation,
			context,
		} as TImplementation;
	}

	return Object.fromEntries(
		Object.entries(implementation).map(([key, child]) => [
			key,
			attachNestRouteContext(
				child as ImplementationTree<HttpRouteDeclaration>,
				context,
			),
		]),
	) as TImplementation;
};

/**
 * Builds a Nest route implementation for a single contract route.
 *
 * @remarks Return this from a controller method decorated with `@Route()`. The
 * optional `context` value is merged into the runtime handler context for that
 * route.
 *
 * @see {@link https://rest-rpc.dev/docs/server/nest#single-routes}
 * @see {@link https://rest-rpc.dev/docs/server/nest#controller-local-context}
 */
export function route<
	const TRoute extends HttpRouteDeclaration,
	TContext extends Record<string, unknown> = Record<never, never>,
>(
	contract: TRoute,
	handler: RouteHandler<TRoute, TContext>,
	options: { context?: Record<string, unknown> } = {},
): RouteImplementation<TRoute> & { context?: Record<string, unknown> } {
	return attachNestRouteContext(
		serverRoute(contract, handler as never),
		options.context,
	);
}

/**
 * Builds a Nest router implementation for a contract.
 *
 * @remarks Return this from a controller method decorated with `@Router()`. The
 * optional `context` value is merged into the runtime handler context for every
 * route in the returned implementation tree.
 *
 * @see {@link https://rest-rpc.dev/docs/server/nest#usage}
 * @see {@link https://rest-rpc.dev/docs/server/nest#controller-local-context}
 */
export function router<const TContract extends NestContract>(
	contract: TContract,
	handlers: RouteHandlers<TContract>,
	options: { context?: Record<string, unknown> } = {},
): ImplementationTreeFor<TContract, HttpRouteDeclaration> {
	return attachNestRouteContext(
		serverRouter(contract, handlers as never) as ImplementationTreeFor<
			TContract,
			HttpRouteDeclaration
		>,
		options.context,
	);
}
