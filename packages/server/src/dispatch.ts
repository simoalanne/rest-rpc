import type { BaseRouteDeclaration } from "@rest-rpc/core/contract";
import type { ServerErrorHandlers } from "./errorHandlers.ts";
import { handleHttpRoute, type HttpRouteResult } from "./handleHttpRoute.ts";
import { compareRouteSpecificity, createPathMatcher } from "./match.ts";
import { createRequestParsingErrorResponse } from "./requestParsingError.ts";
import type {
	RuntimeRouteHandler,
	ServerHttpRouteDeclaration,
} from "./router.ts";
import type { RequestSegments } from "./validation.ts";

/** Runtime implementation tree accepted by shared dispatch, including implicit responses. */
export type DispatchImplementationTree =
	| { route: BaseRouteDeclaration; handler: (...args: never[]) => unknown }
	| { readonly [key: string]: DispatchImplementationTree };

/** A matched implementation and its decoded URL parameters. */
export type ImplementationMatch = {
	implementation: {
		route: BaseRouteDeclaration;
		handler: (...args: never[]) => unknown;
	};
	params: Record<string, string>;
};

/** Compiles an ordinary implementation tree into a method/path matcher. */
export function createImplementationMatcher(tree: DispatchImplementationTree) {
	const flatten = (
		node: DispatchImplementationTree,
	): ImplementationMatch["implementation"][] => {
		if (
			"route" in node &&
			"handler" in node &&
			typeof node.handler === "function"
		) {
			return [node as ImplementationMatch["implementation"]];
		}
		return Object.values(node).flatMap((child) =>
			flatten(child as DispatchImplementationTree),
		);
	};
	const matchers = flatten(tree)
		.sort((a, b) => compareRouteSpecificity(a.route, b.route))
		.map((implementation) => ({
			implementation,
			match: createPathMatcher(implementation.route.path),
		}));
	return (request: {
		method: string;
		path: string;
	}): ImplementationMatch | undefined => {
		for (const { implementation, match } of matchers) {
			if (implementation.route.method !== request.method) continue;
			const params = match(request.path);
			if (params) return { implementation, params };
		}
		return undefined;
	};
}

/** Platform inputs used to decode and execute a matched HTTP request. */
export type DispatchRequestOptions = {
	method: string;
	path: string;
	context: Record<string, unknown>;
	signal: AbortSignal;
	decode: (
		match: ImplementationMatch,
	) => RequestSegments | Promise<RequestSegments>;
	catchParsingErrors?: boolean;
	errorHandlers?: ServerErrorHandlers<Record<string, unknown>>;
};

/** Creates shared HTTP dispatch that only decodes requests after matching. */
export function createHttpDispatcher(tree: DispatchImplementationTree) {
	const match = createImplementationMatcher(tree);
	return async (
		options: DispatchRequestOptions,
	): Promise<HttpRouteResult | undefined> => {
		const matched = match(options);
		if (!matched || matched.implementation.route.mode === "webSocket")
			return undefined;
		let request: RequestSegments;
		try {
			request = await options.decode(matched);
		} catch (error) {
			if (!options.catchParsingErrors) throw error;
			const response = createRequestParsingErrorResponse();
			return {
				kind: "json",
				...response,
				body: response.body,
				responseKindMetadata: false,
			};
		}
		return handleHttpRoute(
			matched.implementation.route as ServerHttpRouteDeclaration,
			matched.implementation.handler as RuntimeRouteHandler,
			{
				request,
				context: { ...options.context, signal: options.signal },
				errorHandlers: options.errorHandlers,
			},
		);
	};
}

type ImplementationContexts<T> = T extends {
	handler: (...args: infer A) => unknown;
}
	? A[0] extends { context: infer C }
		? Omit<C, "signal" | "lastEventId">
		: Record<never, never>
	: T extends object
		? { [K in keyof T]: ImplementationContexts<T[K]> }[keyof T]
		: never;
type IntersectContexts<T> = (
	T extends unknown ? (context: T) => void : never
) extends (context: infer C) => void
	? C
	: never;
/** Application context required by all routes in an implementation tree. */
export type ImplementationContext<T> = IntersectContexts<
	ImplementationContexts<T>
>;
/** Context argument is optional only when the implementation tree requires no fields. */
export type ImplementationContextArguments<T> =
	{} extends ImplementationContext<T>
		? [context?: ImplementationContext<T>]
		: [context: ImplementationContext<T>];
