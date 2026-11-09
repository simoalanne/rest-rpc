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

export type RouteMeta = Record<string, unknown>;

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
	openApi?: OpenApiRouteOptions;
};
