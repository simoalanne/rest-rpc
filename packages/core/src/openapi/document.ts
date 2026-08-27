import type {
	Contract,
	HttpRouteDeclaration,
	RouteDeclaration,
} from "../contract/contract.ts";
import { toOpenApiPath } from "../contract/path.ts";
import { contractRoutes } from "../contract/traversal.ts";
import type {
	OpenApiOperation,
	OperationTransformContext,
	SchemaConverter,
	SchemaRequired,
} from "./operation.ts";
import { createOperation } from "./operation.ts";

export type OpenApiPathItem = Partial<
	Record<"get" | "post" | "put" | "delete" | "patch", OpenApiOperation>
>;

/**
 * The OpenAPI document shape returned by `createOpenApiDocument()`.
 *
 * @see {@link https://rest-rpc.dev/docs/openapi}
 */
export type OpenApiDocument = {
	/** OpenAPI specification version for the generated document. */
	openapi: string;
	/** Human-readable API metadata. */
	info: {
		/** API title shown by OpenAPI tooling. */
		title: string;
		/** API version shown by OpenAPI tooling. */
		version: string;
		/** Optional longer API description. */
		description?: string;
	};
	/** Server URLs where the API is available. */
	servers?: Array<{ url: string; description?: string }>;
	/** Generated OpenAPI paths keyed by path template. */
	paths: Record<string, OpenApiPathItem>;
	/** Reusable OpenAPI components such as security schemes. */
	components?: Record<string, unknown>;
	/** Tags available for grouping generated operations. */
	tags?: Array<{ name: string; description?: string }>;
	/** OpenAPI extension fields. */
	[key: `x-${string}`]: unknown;
};

/**
 * Options for generating an OpenAPI document from a contract.
 *
 * @see {@link https://rest-rpc.dev/docs/openapi#schema-conversion}
 */
export type CreateOpenApiDocumentOptions = {
	/** OpenAPI specification version to emit. */
	openapi?: string;
	/** Human-readable API metadata for the document. */
	info: OpenApiDocument["info"];
	/** Server URLs where the API is available. */
	servers?: OpenApiDocument["servers"];
	/** Reusable OpenAPI components such as security schemes. */
	components?: OpenApiDocument["components"];
	/** Tags available for grouping generated operations. */
	tags?: OpenApiDocument["tags"];
	/** Converts Standard Schema declarations into OpenAPI Schema Objects. */
	schemaConverter?: SchemaConverter;
	/** Declares OpenAPI requiredness for schemas used outside object properties. */
	isSchemaRequired?: SchemaRequired;
	/** Allows project-specific changes to each generated operation. */
	transformOperation?: (context: OperationTransformContext) => OpenApiOperation;
	/** Allows project-specific changes to the completed document. */
	transformDocument?: (document: OpenApiDocument) => OpenApiDocument;
};

const isOpenApiCompatibleRoute = (
	route: RouteDeclaration,
): route is HttpRouteDeclaration => route.mode !== "webSocket";

/**
 * Generates an OpenAPI document object from HTTP routes in a contract.
 *
 * @remarks WebSocket routes are skipped because they do not map faithfully to OpenAPI.
 * @see {@link https://rest-rpc.dev/docs/openapi}
 */
export function createOpenApiDocument(
	contract: Contract,
	options: CreateOpenApiDocumentOptions,
): OpenApiDocument {
	const document: OpenApiDocument = {
		openapi: options.openapi ?? "3.1.0",
		info: options.info,
		...(options.servers ? { servers: options.servers } : {}),
		...(options.components ? { components: options.components } : {}),
		...(options.tags ? { tags: options.tags } : {}),
		paths: {},
	};

	for (const route of contractRoutes(contract)) {
		if (!isOpenApiCompatibleRoute(route)) continue;

		const path = toOpenApiPath(route.path);
		const method = route.method.toLowerCase() as keyof OpenApiPathItem;
		document.paths[path] ??= {};
		document.paths[path][method] = createOperation(route, options);
	}

	return options.transformDocument?.(document) ?? document;
}
