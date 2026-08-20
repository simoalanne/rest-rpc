import type { HttpRouteDeclaration } from "@rest-rpc/core/contract";
import type { RouteErrors } from "./router.ts";

export class RouteResponseError<
	E extends HttpRouteDeclaration = HttpRouteDeclaration,
> extends Error {
	readonly response: RouteErrors<E>;
	readonly status: number;
	readonly body: unknown;
	readonly responseHeaders: Record<string, unknown> | undefined;
	readonly route: E;

	constructor(route: E, response: RouteErrors<E>) {
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
