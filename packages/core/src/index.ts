export type {
	Contract,
	ContractRoute,
	ContractApiRequest,
	ContractApiResponse,
	RouteDeclaration,
	ContractNonSuccessfulResponse,
	ContractRequest,
	ContractResponse,
	ContractSuccessfulResponse,
	DotPaths,
	InferResponseBody,
	JsonRouteDeclaration,
	NoBodyResponse,
	RawRequestRouteDeclaration,
	ResponseBodySchema,
	StreamResponse,
	WebSocketRouteDeclaration,
} from "./contracts.ts";

export type {
	ApiClientFetchOptions,
	ApiClientFor,
	ApiClientOptions,
	ClientResponse,
	ConnectArgs,
	ConnectFn,
	ContractWebSocket,
	DeclaredClientResponse,
	FetchArgs,
	FetchFn,
	FetchOptions,
	FetchResponseFn,
	TryConnectFn,
	UndeclaredClientResponse,
	WebSocketMessageResult,
} from "./client.ts";

export type {
	CreateOpenApiDocumentOptions,
	OpenApiDocument,
} from "./openapi.ts";

export { initClient } from "./client.ts";
export { initContracts, noBody, stream } from "./contracts.ts";
export { createOpenApiDocument } from "./openapi.ts";
