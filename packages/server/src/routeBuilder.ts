import { route as coreRoute } from "@rest-rpc/core";
import type { RouteDeclaration } from "@rest-rpc/core/contract";
import type {
	RuntimeRouteHandler,
	ServerRouteBuilder,
} from "./routeBuilder.types.ts";

type RuntimeBuilder = {
	readonly "~restrpc": Partial<RouteDeclaration> & {
		readonly middleware?: readonly RuntimeRouteHandler[];
	};
	constructor: new (state: object) => RuntimeBuilder;
};

Object.defineProperties(Object.getPrototypeOf(coreRoute), {
	handler: {
		configurable: true,
		value(this: RuntimeBuilder, handler: RuntimeRouteHandler) {
			const state = this["~restrpc"];
			return new this.constructor({
				...(state.kind
					? {}
					: {
							kind: "procedure",
							method: "POST",
							path: "",
							responses: {},
						}),
				...state,
				handler,
			});
		},
	},
	use: {
		configurable: true,
		value(this: RuntimeBuilder, middleware: RuntimeRouteHandler) {
			const state = this["~restrpc"];
			return new this.constructor({
				...state,
				middleware: [...(state.middleware ?? []), middleware],
			});
		},
	},
	middleware: {
		configurable: true,
		value(callback: RuntimeRouteHandler) {
			return callback;
		},
	},
});

/** Core route builder with server-first handler attachment enabled. */
export const serverFirstRoute = coreRoute as unknown as ServerRouteBuilder;
