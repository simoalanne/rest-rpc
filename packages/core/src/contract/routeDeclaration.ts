import type {
	RequestBodySchema,
	RequestHeadersSchema,
	RequestParamsSchema,
} from "./request.ts";
import type { RouteResponses } from "./response.ts";
import type { RouteErrorDeclaration } from "./routeError.ts";

/** An HTTP method supported by a rest-rpc route. */
export type HttpMethod = "GET" | "POST" | "PUT" | "DELETE" | "PATCH";

/** An absolute URL path that begins with a slash. */
export type AbsolutePath = `/${string}`;

/** Application-defined metadata attached to a route. */
export type RouteMetadata = Record<string, unknown>;

/** OpenAPI metadata attached to one route. */
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
export type RequestBodyDeclaration = {
	readonly [mediaType: string]: readonly RequestBodySchema[];
};

/** Canonical ordered request-schema declarations nested on a route. */
export type RouteRequestDeclaration = {
	body?: RequestBodyDeclaration;
	query?: readonly RequestBodySchema[];
	params?: readonly RequestParamsSchema[];
	headers?: readonly RequestHeadersSchema[];
};

/** Error declarations keyed by error code. */
export type RouteErrors = {
	readonly [code: string]: RouteErrorDeclaration;
};

/**
 * The contract information retained for one declared route.
 *
 * @remarks Applications normally create route declarations with `route`
 * instead of constructing this representation directly.
 *
 * @see {@link https://rest-rpc.vercel.app/docs/route-builder}
 */
export type RouteDeclaration = {
	/** The full path, including any prefix, or `undefined` to derive it from tree keys. */
	path: AbsolutePath | undefined;
	/** Prefix prepended to a path derived from tree keys. */
	prefix?: AbsolutePath;
	method: HttpMethod;
	request?: RouteRequestDeclaration;
	responses: RouteResponses;
	errors?: RouteErrors;
	metadata?: RouteMetadata;
	openApi?: OpenApiRouteOptions;
};
