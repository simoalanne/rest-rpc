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
 */
export type NestContract = Contract<HttpRouteDeclaration>;

type AdditionalNestContext<TContext extends Record<string, unknown>> =
	DefaultNestContext & TContext;

/**
 * Infers the Nest route handler request type for a given route declaration.
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
