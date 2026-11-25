import type { Contract } from "../contract/contract.ts";
import { toOpenApiPath } from "../contract/path.ts";
import { contractRouteEntries } from "../contract/traversal.ts";
import type {
	OpenApiOperation,
	OperationTransformContext,
	SchemaConverter,
} from "./operation.ts";
import { createOperation } from "./operation.ts";

type OpenApiPathItem = Partial<
	Record<"get" | "post" | "put" | "delete" | "patch", OpenApiOperation>
>;

/**
 * The OpenAPI document shape returned by `createOpenApiDocument()`.
 *
 * @see {@link https://rest-rpc.vercel.app/docs/openapi}
 */
export type OpenApiDocument = {
	/** OpenAPI specification version for the generated document. */
	openapi: string;
	/** The URI of the document itself. */
	$self?: string;
	/** The default JSON Schema dialect of the document's schemas. */
	jsonSchemaDialect?: string;
	/** Human-readable API metadata, with any other Info Object fields, such as `contact` or `license`. */
	info: {
		/** API title shown by OpenAPI tooling. */
		title: string;
		/** API version shown by OpenAPI tooling. */
		version: string;
		/** Optional longer API description. */
		description?: string;
		[key: string]: unknown;
	};
	/** Server URLs where the API is available, with any other Server Object fields. */
	servers?: Array<{
		url: string;
		description?: string;
		[key: string]: unknown;
	}>;
	/** Generated OpenAPI paths keyed by path template. */
	paths: Record<string, OpenApiPathItem>;
	/** Reusable OpenAPI components such as security schemes. */
	components?: Record<string, unknown>;
	/** Tags available for grouping generated operations, with any other Tag Object fields. */
	tags?: Array<{ name: string; description?: string; [key: string]: unknown }>;
	/** Security requirements of every operation, referencing schemes declared in `components`. */
	security?: Array<Record<string, string[]>>;
	/** A link to external documentation of the API. */
	externalDocs?: { url: string; description?: string; [key: string]: unknown };
	/** OpenAPI extension fields. */
	[key: `x-${string}`]: unknown;
};

/**
 * Options for generating an OpenAPI document from a contract.
 *
 * @remarks The document fields are those of the document except `paths`,
 * which the routes produce, and are copied to it as they are. Without a
 * `schemaConverter`, or when it returns `undefined`, a defined schema becomes
 * an empty OpenAPI Schema Object. `transformOperation` can adjust each
 * generated operation for project-specific conventions.
 *
 * @see {@link https://rest-rpc.vercel.app/docs/openapi#document-options}
 */
export type CreateOpenApiDocumentOptions = Partial<
	Omit<OpenApiDocument, "info" | "paths">
> & {
	/** Human-readable API metadata. `title` defaults to `"API"` and `version` to `"0.0.0"`. */
	info?: Partial<OpenApiDocument["info"]>;
	/** Converts Standard Schema definitions into OpenAPI Schema Objects. */
	schemaConverter?: SchemaConverter;
	/** Allows project-specific changes to each generated operation. */
	transformOperation?: (context: OperationTransformContext) => OpenApiOperation;
};

/**
 * Generates an OpenAPI document object from HTTP routes in a contract.
 *
 * @see {@link https://rest-rpc.vercel.app/docs/openapi}
 */
export function createOpenApiDocument(
	contract: Contract,
	options: CreateOpenApiDocumentOptions = {},
): OpenApiDocument {
	const {
		openapi = "3.2.1",
		info,
		schemaConverter: _schemaConverter,
		transformOperation: _transformOperation,
		...fields
	} = options;
	const document: OpenApiDocument = {
		openapi,
		info: { title: "API", version: "0.0.0", ...info },
		...fields,
		paths: {},
	};

	for (const { route, path: routePath } of contractRouteEntries(contract)) {
		const path = toOpenApiPath(route.path);
		const method = route.method.toLowerCase() as keyof OpenApiPathItem;
		document.paths[path] ??= {};
		document.paths[path][method] = createOperation(route, options, routePath);
	}

	return document;
}
