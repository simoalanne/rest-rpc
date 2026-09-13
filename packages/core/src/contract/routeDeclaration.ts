import type { StandardSchemaV1 } from "../standard-schema/index.ts";
import type {
	JsonQuery,
	RequestBodySchema,
	RequestHeadersDeclaration,
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

/** OpenAPI metadata that may be shared by a configured route factory. */
export type CommonOpenApiRouteOptions = Omit<
	OpenApiRouteOptions,
	"summary" | "description" | "operationId"
>;

/** Canonical request declaration nested on a route. */
export type RouteRequestDeclaration = {
	body?: RequestBodySchema;
	query?: RequestQuerySchema | JsonQuery;
	params?: RequestParamsSchema;
	headers?: RequestHeadersDeclaration;
};

/** A canonical route declaration produced by an HTTP or procedure builder. */
export type RouteDeclaration = {
	kind: "http" | "procedure";
	path: string;
	method: HttpMethod;
	request?: RouteRequestDeclaration;
	responses: RouteResponses;
	metadata?: RouteMetadata;
	openApi?: OpenApiRouteOptions;
};
