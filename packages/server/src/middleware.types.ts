import type { RouteDeclaration } from "@rest-rpc/core/contract";
import type { RouteRequest } from "./routeBuilder.types.ts";

/** Unchecked application output returned by middleware. */
export type MiddlewareReturn = unknown;

type Controls = {
	next(): Promise<unknown>;
};
type UnknownRequest = {
	params: unknown;
	headers: unknown;
	body: unknown;
	query: unknown;
	input: unknown;
};

/**
 * Validated declaration-position request data, adapter fields, context, and controls for inline middleware.
 *
 * @see {@link https://rest-rpc.dev/docs/middleware}
 */
export type MiddlewareRequest<
	TRoute extends RouteDeclaration,
	TFields extends object,
	TContext extends object,
> = RouteRequest<TRoute, TFields, TContext> & UnknownRequest & Controls;

/**
 * Adapter fields, global context, unknown request locations, and controls for reusable middleware.
 *
 * @see {@link https://rest-rpc.dev/docs/middleware}
 */
export type ReusableMiddlewareRequest<
	TFields extends object,
	TContext extends object,
> = TFields &
	UnknownRequest & { route: RouteDeclaration; context: TContext } & Controls;
