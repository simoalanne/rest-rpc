import { route as coreRoute } from "@rest-rpc/core";
import type {
	RuntimeRouteHandler,
	RuntimeServerRoute,
	ServerRouteBuilder,
} from "./routeBuilder.types.ts";

Object.defineProperties(Object.getPrototypeOf(coreRoute), {
	handler: {
		configurable: true,
		value(this: RuntimeServerRoute, handler: RuntimeRouteHandler) {
			const state = this["~restrpc"];
			return this.clone({
				...(state.kind
					? {}
					: {
							kind: "procedure",
							method: "POST",
							path: undefined,
							responses: {},
						}),
				...state,
				handler,
			});
		},
	},
	use: {
		configurable: true,
		value(this: RuntimeServerRoute, middleware: RuntimeRouteHandler) {
			const state = this["~restrpc"];
			return this.clone({
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
	$context: {
		configurable: true,
		value(this: RuntimeServerRoute) {
			return this;
		},
	},
});

/** Core route builder with server-first handler attachment enabled. */
export const serverFirstRoute = coreRoute as unknown as ServerRouteBuilder;
