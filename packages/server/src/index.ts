/**
 * The default application context shared by handlers and middleware. Augment
 * this interface with `declare module "@rest-rpc/server"`. Defaults to an empty
 * object if not extended.
 *
 * @default {}
 */
export interface DefaultContext {}

export type {
	HandleHttpRouteConfiguration,
	HandleHttpRouteOptions,
} from "./handleHttpRoute.ts";
export type { HttpRouteResult } from "./httpRouteResult.ts";
export type { SerializedHttpRouteResult } from "./serializeHttpRouteResult.ts";
export { serializeHttpRouteResult } from "./serializeHttpRouteResult.ts";
export { handleHttpRoute } from "./handleHttpRoute.ts";
export {
	createPathParamsReader,
	createRouteMatcher,
	flattenRouteImplementations,
	isImplementedRoute,
	resolveImplementationPath,
} from "./match.ts";
export type {
	ImplementedRoute,
	ParamSyntax,
	RouteMatch,
	RuntimeImplementation,
	RuntimeImplementationTree,
} from "./match.ts";
export type {
	RouteHandler,
	RouteHandlerFor,
	RouteRequest,
} from "./routeBuilder.types.ts";
export type { InferServerRequest, InferServerResponse } from "@rest-rpc/core";
export type { RequestSegments, ValidationIssue } from "./validation.ts";
export type {
	RequestValidationIssues,
	ResponseValidationLocation,
} from "./validationErrors.ts";
export {
	RequestValidationError,
	ResponseValidationError,
} from "./validationErrors.ts";
export { implement } from "./implement.ts";
export type { AdapterApi } from "./adapterApi.ts";
export { createAdapterApi } from "./adapterApi.ts";
export type { ContractImplementer } from "./implement.types.ts";
export { serverRoute } from "./routeBuilder.ts";
export type {
	ImplicitResponseEnvelope,
	ImplicitResponseKind,
} from "./implicitResponse.types.ts";
export type { PublicServerRouteBuilder } from "./routeBuilder.types.ts";
export type { ServerRouteBuilderKind } from "./routeBuilder.ts";
export { assertRequestContentType } from "./requestContentType.ts";
export type { Context } from "./context.ts";
export type {
	MiddlewareReturn,
	MiddlewareRequest,
	ReusableMiddlewareRequest,
} from "./middleware.types.ts";
export type {
	CreateOpenApiDocumentOptions,
	OpenApiDocument,
	BodyCodec,
} from "@rest-rpc/core";
export { createOpenApiDocument } from "@rest-rpc/core";
export { sse } from "./sse.ts";
export type { SseServerEvent } from "./sse.ts";
export type { SseEvent } from "@rest-rpc/core";
