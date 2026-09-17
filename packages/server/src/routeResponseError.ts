import type {
	Contract,
	RouteDeclaration,
	ServerErrors,
} from "@rest-rpc/core/contract";

type HttpRoutes<TContract> = TContract extends {
	readonly "~restrpc": infer TRoute extends RouteDeclaration;
}
	? TRoute extends { output: "response" }
		? TRoute
		: TRoute extends { output: "output" }
			? never
			: TRoute extends { kind: "http" }
				? TRoute
				: never
	: TContract extends Record<string, unknown>
		? {
				[TKey in keyof TContract]: HttpRoutes<TContract[TKey]>;
			}[keyof TContract]
		: never;

/**
 * Carries a declared non-success response thrown from a route handler.
 *
 * @remarks Server adapters validate and serialize its response as an ordinary
 * declared route result instead of treating it as an unexpected server error.
 *
 * @see {@link https://rest-rpc.dev/docs/route-builder}
 */
export class RouteResponseError<
	TContract extends Contract = Contract,
> extends Error {
	readonly response: ServerErrors<HttpRoutes<TContract>>;
	readonly status: number;
	readonly body: unknown;
	readonly contentType: string | undefined;
	readonly responseHeaders: Record<string, unknown> | undefined;
	readonly route: TContract;

	constructor(route: TContract, response: ServerErrors<HttpRoutes<TContract>>) {
		super("Route response error");
		const responseFields = response as { status: number; body: unknown };
		this.response = response;
		this.status = responseFields.status;
		this.body = responseFields.body;
		this.contentType = (response as { contentType?: string }).contentType;
		this.responseHeaders = (
			response as { responseHeaders?: Record<string, unknown> }
		).responseHeaders;
		this.route = route;
	}
}
