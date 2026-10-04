import type { StandardSchemaV1 } from "../standard-schema/index.ts";
import type { RouteDeclaration } from "./routeDeclaration.ts";

/** Whether a route reads one flat `input` instead of separate request segments. */
export type UsesFlatInput<TRoute extends RouteDeclaration> = TRoute extends {
	request: { input: readonly StandardSchemaV1[] };
}
	? true
	: false;

/** Whether a route returns its 200 body directly instead of status responses. */
export type UsesPlainOutput<TRoute extends RouteDeclaration> = TRoute extends {
	output: "output";
}
	? true
	: false;

/** Runtime counterpart of {@link UsesFlatInput}. */
export const usesFlatInput = (route: Pick<RouteDeclaration, "request">) =>
	route.request?.input !== undefined;

/** Runtime counterpart of {@link UsesPlainOutput}. */
export const usesPlainOutput = (route: Pick<RouteDeclaration, "output">) =>
	route.output === "output";
