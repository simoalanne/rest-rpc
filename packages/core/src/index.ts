export type {
	ApiClientFor,
	ApiClientOptions,
	ClientResponse,
	FetchLike,
	NextFetchTagsOptions,
	ServerFirstClientFor,
	ServerFirstClientOptions,
} from "./client/index.ts";
export {
	getNextFetchTags,
	initClient,
	request,
	SERVER_FIRST_RESPONSE_KIND_HEADER,
} from "./client/index.ts";
export type { Contract, RouteDeclaration } from "./contract/index.ts";
export type { ClientRequest } from "./contract/request.ts";
export { route } from "./contract/routeBuilder.ts";
export type {
	CustomResponseBody,
	CustomResponseValue,
} from "./contract/body.ts";
export type {
	CreateOpenApiDocumentOptions,
	OpenApiDocument,
} from "./openapi/index.ts";
export { createOpenApiDocument } from "./openapi/index.ts";
export { type } from "./standard-schema/type.ts";

export type { ApiClientRouteValue } from "./client/types.ts";
export type { EncodedRequest } from "./client/serverFirstClient.ts";
