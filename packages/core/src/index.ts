export type {
	ApiClientFor,
	ApiClientOptions,
	ClientEventSource,
	ClientResponse,
	ClientSocket,
	FetchLike,
	NextFetchTagsOptions,
	ServerFirstClientFor,
	ServerFirstClientInitializer,
	ServerFirstClientOptions,
} from "./client/index.ts";
export {
	getNextFetchTags,
	initClient,
	initServerFirstClient,
	request,
	SERVER_FIRST_RESPONSE_KIND_HEADER,
} from "./client/index.ts";
export type {
	ClientReceived,
	ClientSseReceived,
	ClientSent,
	Contract,
	RouteDeclaration,
} from "./contract/index.ts";
export type { ClientRequest } from "./contract/request.ts";
export type { ClientResponseBody } from "./contract/response.ts";
export { route } from "./contract/routeFactory.ts";
export type { CustomResponseBody } from "./contract/body.ts";
export type {
	CreateOpenApiDocumentOptions,
	OpenApiDocument,
} from "./openapi/index.ts";
export { createOpenApiDocument } from "./openapi/index.ts";
export { type } from "./standard-schema/type.ts";

export type { ApiClientRouteValue } from "./client/types.ts";
export type { EncodedRequest } from "./client/initserverFirstClient.ts";
