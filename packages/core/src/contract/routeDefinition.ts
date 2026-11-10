import type {
	RequestBodySchema,
	RequestHeadersSchema,
	RequestParamsSchema,
} from "./request.ts";
import type { RouteResponses } from "./response.ts";
import type { RouteErrorDefinition } from "./routeError.ts";

export type HttpMethod = "GET" | "POST" | "PUT" | "DELETE" | "PATCH";

/** An absolute URL path that begins with a slash. */
export type AbsolutePath = `/${string}`;

// Interfaces have no index signature, so metadata shapes are plain objects.
export type RouteMeta = object;

/**
 * The default route metadata shape, which `.meta()` values must match. Augment
 * this interface with `declare module "@rest-rpc/core"`, or with
 * `declare module "@rest-rpc/server"` in server code. While it has no keys,
 * `.meta()` is unavailable until a shape is declared with `$meta()`.
 *
 * @default {}
 *
 * @see {@link https://rest-rpc.vercel.app/docs/middleware#metadata}
 */
export interface DefaultMeta {}

export type OpenApiRouteOptions = {
	summary?: string;
	description?: string;
	operationId?: string;
	tags?: string[];
	deprecated?: boolean;
	security?: Array<Record<string, string[]>>;
	externalDocs?: { url: string; description?: string };
	extensions?: Record<`x-${string}`, unknown>;
};

/** Ordered body schemas keyed by base media type. */
export type RequestBodyDefinition = {
	readonly [mediaType: string]: readonly RequestBodySchema[];
};

export type RouteRequestDefinition = {
	body?: RequestBodyDefinition;
	query?: readonly RequestBodySchema[];
	params?: readonly RequestParamsSchema[];
	headers?: readonly RequestHeadersSchema[];
};

export type RouteErrors = {
	readonly [code: string]: RouteErrorDefinition;
};

/**
 * The contract information retained for one defined route.
 *
 * @remarks Applications normally create route definitions with `route`
 * instead of constructing this representation directly.
 *
 * @see {@link https://rest-rpc.vercel.app/docs/route-builder}
 */
export type RouteDefinition = {
	/** The full path, including any prefix, or `undefined` to derive it from tree keys. */
	path: AbsolutePath | undefined;
	/** Prefix prepended to a path derived from tree keys. */
	prefix?: AbsolutePath;
	method: HttpMethod;
	request?: RouteRequestDefinition;
	responses: RouteResponses;
	errors?: RouteErrors;
	meta?: RouteMeta;
	/** Type-only metadata shape declared with `$meta()` and `DefaultMeta`, with no runtime value. */
	metaShape?: RouteMeta;
	openApi?: OpenApiRouteOptions;
};
