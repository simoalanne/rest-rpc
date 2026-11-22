import type { StandardSchemaV1 } from "../standard-schema/index.ts";
import type { RecordSchema } from "./request.ts";
import type { RawResponse } from "./raw.ts";
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

/**
 * The OpenAPI operation fields of a route, set with `.openAPI()`.
 *
 * @see {@link https://rest-rpc.vercel.app/docs/openapi#operation-details}
 */
export type OpenApiRouteOptions = {
	/** A short summary of what the operation does. */
	summary?: string;
	/** A longer description of the operation. */
	description?: string;
	/** A unique identifier of the operation, used by SDK generators for method names. Defaults to the route's key path in the route tree, such as `posts.get`, and an empty value leaves it out. */
	operationId?: string;
	/** Tags that group the operation, merged with the tags of earlier calls. */
	tags?: string[];
	/** Marks the operation as deprecated. */
	deprecated?: boolean;
	/** Security requirements, referencing schemes declared in `components`. */
	security?: Array<Record<string, string[]>>;
	/** A link to external documentation of the operation. */
	externalDocs?: { url: string; description?: string };
	/** Extension fields whose keys start with `x-`, added to the operation and merged with those of earlier calls. */
	extensions?: Record<`x-${string}`, unknown>;
};

/**
 * The request segments of a route, each an ordered list of stacked schemas. The
 * body's content type is a `content-type` header, so a headers schema declares
 * it.
 */
export type RouteRequestDefinition = {
	body?: readonly StandardSchemaV1[];
	query?: readonly RecordSchema[];
	params?: readonly RecordSchema[];
	headers?: readonly RecordSchema[];
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
	/** Set by `.response(raw())`: the handler returns a Fetch `Response`. */
	raw?: RawResponse;
	errors?: RouteErrors;
	meta?: RouteMeta;
	/** Type-only metadata shape declared with `$meta()` and `DefaultMeta`, with no runtime value. */
	metaShape?: RouteMeta;
	openApi?: OpenApiRouteOptions;
};
