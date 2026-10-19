import type { BodyContentType } from "./body.ts";
import type {
	RequestBodySchema,
	RequestHeadersSchema,
	RequestParamsSchema,
} from "./request.ts";
import type { RouteResponses } from "./response.ts";

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

/** Canonical ordered request-schema declarations nested on a route. */
export type RouteRequestDeclaration = {
	body?: readonly RequestBodySchema[];
	contentType?: BodyContentType;
	query?: readonly RequestBodySchema[];
	params?: readonly RequestParamsSchema[];
	headers?: readonly RequestHeadersSchema[];
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
	path: AbsolutePath | undefined;
	method: HttpMethod;
	request?: RouteRequestDeclaration;
	responses: RouteResponses;
	metadata?: RouteMetadata;
	openApi?: OpenApiRouteOptions;
};
