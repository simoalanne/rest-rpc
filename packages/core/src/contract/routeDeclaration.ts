import type { StandardSchemaV1 } from "../standard-schema/index.ts";
import type { BodyContentType } from "./body.ts";
import type {
	RequestBodySchema,
	RequestHeadersSchema,
	RequestParamsSchema,
	RequestQuerySchema,
} from "./request.ts";
import type { RouteResponses } from "./response.ts";

/** An HTTP method supported by a rest-rpc route. */
export type HttpMethod = "GET" | "POST" | "PUT" | "DELETE" | "PATCH";

/** Application-defined metadata attached to a route. */
export type RouteMetadata = Record<string, unknown>;

/** Declares one OpenAPI response header entry. */
export type OpenApiResponseHeader =
	| StandardSchemaV1
	| { description?: string; schema: StandardSchemaV1 };

/** Adds OpenAPI-only metadata for one route response status. */
export type OpenApiResponseOptions = {
	description?: string;
	headers?: Record<string, OpenApiResponseHeader>;
};

/** OpenAPI metadata attached to one route. */
export type OpenApiRouteOptions = {
	summary?: string;
	description?: string;
	operationId?: string;
	tags?: string[];
	deprecated?: boolean;
	security?: Array<Record<string, string[]>>;
	externalDocs?: { url: string; description?: string };
	responses?: Record<number, OpenApiResponseOptions>;
	extensions?: Record<`x-${string}`, unknown>;
};

/** OpenAPI operation metadata attached to a route declaration. */
export type CommonOpenApiRouteOptions = Omit<
	OpenApiRouteOptions,
	"summary" | "description" | "operationId"
>;

/** Canonical request declaration nested on a route. */
export type RouteRequestDeclaration = {
	body?: RequestBodySchema;
	contentType?: BodyContentType;
	query?: RequestQuerySchema;
	params?: RequestParamsSchema;
	headers?: RequestHeadersSchema;
};

/**
 * The contract information retained for one declared route.
 *
 * @remarks Applications normally create route declarations with `route`
 * instead of constructing this representation directly.
 *
 * @see {@link https://rest-rpc.dev/docs/route-builder}
 */
export type RouteDeclaration = {
	source?: "generated";
	kind: "http" | "procedure";
	path: string;
	method: HttpMethod;
	input?: "input" | "segments";
	output?: "output" | "response";
	request?: RouteRequestDeclaration;
	responses: RouteResponses;
	metadata?: RouteMetadata;
	openApi?: OpenApiRouteOptions;
};
