export { implement, route, type InferServerHandler } from "../runtime.ts";

/**
 * Indicates whether the Node HTTP catch-all handler dispatched a request to a rest-rpc route.
 *
 * @see {@link https://rest-rpc.dev/docs/server/node}
 */
export type NodeRouteHandlerResult = { matched: boolean };
export { type } from "@rest-rpc/core";
export type {
	Context,
	InferServerRequest,
	InferServerResponse,
} from "../index.ts";
export { RequestValidationError, ResponseValidationError } from "../index.ts";
export { compileRoutes, createCatchAllHandler } from "./handler.ts";
export type {
	CompileRoutesOptions,
	HandleOptions,
	NodeRoute,
	RequestValidationErrorHandler,
	ResponseValidationErrorHandler,
} from "./handler.ts";
export type {
	CreateOpenApiDocumentOptions,
	OpenApiDocument,
	BodyCodec,
} from "@rest-rpc/core";
export { createOpenApiDocument } from "@rest-rpc/core";
export { sse } from "../index.ts";
export type { SseEvent } from "@rest-rpc/core";
