export type {
	Contract,
	ContractApiRequest,
	ContractApiResponse,
	ContractNonSuccessfulResponse,
	ContractRequest,
	ContractResponse,
	ContractSuccessfulResponse,
	ContractTree,
	DotPaths,
	InferResponseBody,
	NoBodyResponse,
	ResponseBodySchema,
	StreamResponse,
} from "./contracts.ts";

export type {
	ApiClientFetchOptions,
	ApiClientOptions,
	ApiClientTree,
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
