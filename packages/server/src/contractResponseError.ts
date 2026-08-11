import type { RouteDeclaration, ServerErrors } from "@rest-rpc/core/contract";

export class ContractResponseError<
	E extends RouteDeclaration = RouteDeclaration,
> extends Error {
	readonly response: ServerErrors<E>;
	readonly status: number;
	readonly body: unknown;
	readonly route: E;

	constructor(route: E, response: ServerErrors<E>) {
		super("Contract response error");
		const responseFields = response as { status: number; body: unknown };
		this.response = response;
		this.status = responseFields.status;
		this.body = responseFields.body;
		this.route = route;
	}
}
