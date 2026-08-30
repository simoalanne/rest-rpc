import type { Contract, HttpRouteDeclaration } from "@rest-rpc/core/contract";
import type { RouteErrors } from "./router.ts";

type HttpRoutes<TContract> = TContract extends HttpRouteDeclaration
	? TContract
	: TContract extends Record<string, unknown>
		? {
				[TKey in keyof TContract]: HttpRoutes<TContract[TKey]>;
			}[keyof TContract]
		: never;

/**
 * Throws a declared non-success response from a route handler.
 *
 * @see {@link https://rest-rpc.dev/docs/http-responses#response-with-multiple-status-codes}
 */
export class RouteResponseError<
	TContract extends Contract = HttpRouteDeclaration,
> extends Error {
	readonly response: RouteErrors<HttpRoutes<TContract>>;
	readonly status: number;
	readonly body: unknown;
	readonly responseHeaders: Record<string, unknown> | undefined;
	readonly route: TContract;

	constructor(route: TContract, response: RouteErrors<HttpRoutes<TContract>>) {
		super("Route response error");
		const responseFields = response as { status: number; body: unknown };
		this.response = response;
		this.status = responseFields.status;
		this.body = responseFields.body;
		this.responseHeaders = (
			response as { responseHeaders?: Record<string, unknown> }
		).responseHeaders;
		this.route = route;
	}
}
