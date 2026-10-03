import { RouteBuilder, type RouteDeclaration } from "@rest-rpc/core/contract";
import type {
	PublicServerRouteBuilder,
	RuntimeRouteHandler,
} from "./routeBuilder.types.ts";

type ServerRouteBuilderState = Partial<RouteDeclaration> & {
	readonly handler?: unknown;
	readonly middleware?: readonly RuntimeRouteHandler[];
};

/** Core route builder extended with server handler and middleware attachment. */
export class ServerRouteBuilder extends RouteBuilder {
	declare readonly "~restrpc": ServerRouteBuilderState;

	override clone(
		state: ServerRouteBuilderState,
		methodSelected?: boolean,
	): ServerRouteBuilder {
		return new ServerRouteBuilder(state, methodSelected ?? this.methodSelected);
	}

	handler(handler: RuntimeRouteHandler): ServerRouteBuilder {
		const state = this["~restrpc"];
		return this.clone({
			...(state.method
				? {}
				: {
						method: "POST",
						path: undefined,
						responses: {},
					}),
			...state,
			handler,
		});
	}

	use(middleware: RuntimeRouteHandler): ServerRouteBuilder {
		const state = this["~restrpc"];
		return this.clone({
			...state,
			middleware: [...(state.middleware ?? []), middleware],
		});
	}

	middleware(callback: RuntimeRouteHandler): RuntimeRouteHandler {
		return callback;
	}

	$context(): this {
		return this;
	}
}

/** Core route builder with server-first handler attachment enabled. */
export const serverRoute = new ServerRouteBuilder({
	path: undefined,
}) as unknown as PublicServerRouteBuilder;
