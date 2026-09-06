import type {
	CommonOpenApiRouteOptions,
	RouteMetadata,
} from "./baseRouteDeclaration.ts";
import { getPathParamNames } from "./path.ts";
import type { RequestHeadersSchema } from "./request.ts";
import type { RouteResponses } from "./response.ts";
import { createHttpRoute, type HttpBuilderFor } from "./httpRouteBuilder.ts";
import { createSseRoute, type SseBuilderFor } from "./sseRouteBuilder.ts";
import {
	createWebSocketRoute,
	type WebSocketBuilderFor,
} from "./websocketRouteBuilder.ts";
export { joinPathPrefix } from "./baseRouteBuilder.ts";

/** Defaults applied locally by a configured route factory. */
export type RouteFactoryOptions = {
	flattenRequestKeys?: boolean;
	strictStatusCodes?: boolean;
	pathPrefix?: string;
	metadata?: RouteMetadata;
	responses?: RouteResponses;
	headers?: RequestHeadersSchema;
	openApi?: CommonOpenApiRouteOptions;
};

const assertStaticPathPrefix = (pathPrefix: string | undefined) => {
	if (pathPrefix && getPathParamNames(pathPrefix).length > 0) {
		throw new Error("Route factory pathPrefix cannot include path params.");
	}
};

type RouteFactory<TOptions = undefined> = {
	/** Starts a `GET` route declaration. @see {@link https://rest-rpc.dev/docs/contract/declaration#route-builders} */
	get<const TPath extends string>(
		path: TPath,
	): HttpBuilderFor<TOptions, "GET", TPath>;
	/** Starts a `POST` route declaration. @see {@link https://rest-rpc.dev/docs/contract/declaration#route-builders} */
	post<const TPath extends string>(
		path: TPath,
	): HttpBuilderFor<TOptions, "POST", TPath>;
	/** Starts a `PUT` route declaration. @see {@link https://rest-rpc.dev/docs/contract/declaration#route-builders} */
	put<const TPath extends string>(
		path: TPath,
	): HttpBuilderFor<TOptions, "PUT", TPath>;
	/** Starts a `PATCH` route declaration. @see {@link https://rest-rpc.dev/docs/contract/declaration#route-builders} */
	patch<const TPath extends string>(
		path: TPath,
	): HttpBuilderFor<TOptions, "PATCH", TPath>;
	/** Starts a `DELETE` route declaration. @see {@link https://rest-rpc.dev/docs/contract/declaration#route-builders} */
	delete<const TPath extends string>(
		path: TPath,
	): HttpBuilderFor<TOptions, "DELETE", TPath>;
	/** Starts an SSE route declaration. @see {@link https://rest-rpc.dev/docs/http-responses#server-sent-event-responses} */
	sse<const TPath extends string>(path: TPath): SseBuilderFor<TOptions, TPath>;
	/** Starts a WebSocket route declaration. @see {@link https://rest-rpc.dev/docs/websockets#contract} */
	ws(path: string): WebSocketBuilderFor<TOptions>;
};

const createFactory = (options: RouteFactoryOptions = {}) => {
	assertStaticPathPrefix(options.pathPrefix);
	return {
		get: (path: string) => createHttpRoute("GET", path, options),
		post: (path: string) => createHttpRoute("POST", path, options),
		put: (path: string) => createHttpRoute("PUT", path, options),
		patch: (path: string) => createHttpRoute("PATCH", path, options),
		delete: (path: string) => createHttpRoute("DELETE", path, options),
		sse: (path: string) => createSseRoute(path, options),
		ws: (path: string) => createWebSocketRoute(path, options),
	};
};

type Simplify<T> = T extends object ? { [K in keyof T]: T[K] } : T;

/**
 * Creates route declarations for a shared API contract.
 *
 * @remarks Use `route.with` to configure options shared by a group of
 * routes, such as a path prefix, headers, responses, or OpenAPI metadata.
 * @see {@link https://rest-rpc.dev/docs/contract/declaration#route-builders}
 */
export const route = {
	...createFactory(),
	/** Creates a factory with shared options. @see {@link https://rest-rpc.dev/docs/contract/declaration#shared-route-options} */
	with<const TOptions extends RouteFactoryOptions>(options: TOptions) {
		return createFactory(options);
	},
} as unknown as Simplify<
	RouteFactory & {
		/** Creates a factory with shared options. @see {@link https://rest-rpc.dev/docs/contract/declaration#shared-route-options} */
		with<const TOptions extends RouteFactoryOptions>(
			options: TOptions,
		): RouteFactory<TOptions>;
	}
>;

export type {
	HttpBuilderFor,
	RouteFactory,
	SseBuilderFor,
	WebSocketBuilderFor,
};
