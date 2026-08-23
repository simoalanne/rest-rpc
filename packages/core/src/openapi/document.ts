import type { Contract } from "../contract/contract.ts";
import { toOpenApiPath } from "../contract/path.ts";
import { contractRoutes } from "../contract/traversal.ts";
import { createOperation } from "./operation.ts";
import { isOpenApiRoute } from "./routes.ts";
import type {
	CreateOpenApiDocumentOptions,
	OpenApiDocument,
	OpenApiPathItem,
} from "./types.ts";

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
		if (!isOpenApiRoute(route)) continue;

		const path = toOpenApiPath(route.path);
		const method = route.method.toLowerCase() as keyof OpenApiPathItem;
		document.paths[path] ??= {};
		document.paths[path][method] = createOperation(route, options);
	}

	return options.transformDocument?.(document) ?? document;
}
