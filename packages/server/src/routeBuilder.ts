import { route as coreRoute } from "@rest-rpc/core";
import type { RouteDeclaration } from "@rest-rpc/core/contract";
import type {
	RuntimeRouteHandler,
	ServerRouteBuilder,
} from "./routeBuilder.types.ts";

type RuntimeBuilder = {
	readonly "~restrpc": Partial<RouteDeclaration>;
	constructor: new (state: object) => RuntimeBuilder;
};

type RuntimeBuilderPrototype = {
	handler?: (
		this: RuntimeBuilder,
		handler: RuntimeRouteHandler,
	) => RuntimeBuilder;
};

const prototype = Object.getPrototypeOf(coreRoute) as RuntimeBuilderPrototype;

if (!prototype.handler) {
	Object.defineProperty(prototype, "handler", {
		value(this: RuntimeBuilder, handler: RuntimeRouteHandler) {
			const state = this["~restrpc"];
			return new this.constructor({
				...(state.kind
					? state
					: { kind: "procedure", method: "POST", path: "", responses: {} }),
				handler,
			});
		},
	});
}

/** Core route builder with server-first handler attachment enabled. */
export const serverFirstRoute = coreRoute as unknown as ServerRouteBuilder;
