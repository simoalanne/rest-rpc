import type {
	Contract,
	RouteDeclaration,
	WebSocketRouteDeclaration,
} from "../contract/contract.ts";
import type {
	ClientReceived,
	ClientRequest,
	ClientSent,
	IsWebSocketRoute,
} from "../contract/request.ts";
import type {
	ClientResponseBody,
	DeclaredClientResponse,
} from "../contract/response.ts";

export type FetchOptions = Omit<RequestInit, "method" | "body" | "headers">;

export type ApiClientFetchOptions = Omit<FetchOptions, "signal">;

/**
 * The fetch-compatible function shape used by the core client.
 *
 * @see {@link https://rest-rpc.dev/docs/client/fetch-client#custom-fetch}
 */
export type FetchLike = (
	input: string | URL | Request,
	init?: RequestInit,
) => Promise<Response>;

export type FetchArgs<E extends RouteDeclaration = RouteDeclaration> =
	ClientRequest<E> extends never
		? [options?: FetchOptions]
		: [request: ClientRequest<E>, options?: FetchOptions];

export type FetchFn<E extends RouteDeclaration> = (
	...args: FetchArgs<E>
) => Promise<ClientResponseBody<E>>;

type RouteDeclaredResponse<E extends RouteDeclaration> =
	DeclaredClientResponse<E> & {
		declared: true;
		headers: Headers;
	};

type RouteUndeclaredResponse = {
	declared: false;
	status: number;
	body: unknown;
	headers: Headers;
};

/**
 * The response envelope returned by `fetchResponse()` for a route.
 *
 * @see {@link https://rest-rpc.dev/docs/client/fetch-client#fetchresponse}
 */
export type ClientResponse<E extends RouteDeclaration> =
	| RouteDeclaredResponse<E>
	| RouteUndeclaredResponse;

export type FetchResponseFn<E extends RouteDeclaration> = (
	...args: FetchArgs<E>
) => Promise<ClientResponse<E>>;

export type OpenConnectionArgs<E extends RouteDeclaration = RouteDeclaration> =
	ClientRequest<E> extends never ? [] : [request: ClientRequest<E>];

/**
 * The typed WebSocket client returned by a WebSocket route's `openConnection()`.
 *
 * @see {@link https://rest-rpc.dev/docs/websockets#client}
 */
export type ClientSocket<E extends WebSocketRouteDeclaration> = Pick<
	WebSocket,
	"close" | "readyState" | "url"
> & {
	raw: WebSocket;
	send: (message: ClientSent<E>) => void;
	onOpen: (callback: (event: Event) => void) => () => void;
	onMessage: (callback: (message: ClientReceived<E>) => void) => () => void;
	onError: (callback: (event: Event) => void) => () => void;
	onClose: (callback: (event: CloseEvent) => void) => () => void;
};

export type OpenConnectionFn<E extends RouteDeclaration> = (
	...args: OpenConnectionArgs<E>
) => E extends WebSocketRouteDeclaration ? ClientSocket<E> : never;

type ApiClientMoreThanOneSuccessResponseRouteValue<E extends RouteDeclaration> =
	{
		fetchResponse: FetchResponseFn<E>;
	};

type ApiClientSingleSuccessResponseRouteValue<E extends RouteDeclaration> = {
	fetch: FetchFn<E>;
	fetchResponse: FetchResponseFn<E>;
};

type ApiClientHttpRouteValue<E extends RouteDeclaration = RouteDeclaration> =
	ClientResponseBody<E> extends never
		? ApiClientMoreThanOneSuccessResponseRouteValue<E>
		: ApiClientSingleSuccessResponseRouteValue<E>;

type ApiClientWebSocketRouteValue<
	E extends RouteDeclaration = RouteDeclaration,
> = {
	openConnection: OpenConnectionFn<E>;
};

export type ApiClientRouteValue<E extends RouteDeclaration = RouteDeclaration> =
	E extends RouteDeclaration
		? IsWebSocketRoute<E> extends true
			? ApiClientWebSocketRouteValue<E>
			: ApiClientHttpRouteValue<E>
		: never;

/**
 * Infers the generated client tree for a contract.
 *
 * @see {@link https://rest-rpc.dev/docs/type-helpers#fetch-client}
 */
export type ApiClientFor<T extends Contract = Contract> =
	T extends RouteDeclaration
		? ApiClientRouteValue<T>
		: {
				[K in keyof T]: T[K] extends Contract ? ApiClientFor<T[K]> : never;
			};

export type GetHeadersFn = () =>
	| Record<string, string>
	| Promise<Record<string, string>>;

/**
 * Enables deterministic Next.js fetch tags for generated GET requests.
 *
 * @see {@link https://rest-rpc.dev/docs/client/fetch-client#use-in-nextjs}
 */
export type NextFetchTagsOptions = {
	enabled: boolean;
	tagPrefix?: string;
};

/**
 * Options used to create a typed fetch client.
 *
 * @see {@link https://rest-rpc.dev/docs/client/fetch-client#client-options}
 */
export type ApiClientOptions = {
	baseUrl: string;
	fetch?: FetchLike;
	fetchOptions?: ApiClientFetchOptions;
	getGlobalHeaders?: GetHeadersFn;
	nextFetchTags?: NextFetchTagsOptions;
	timeoutMs?: number;
	unknownRequestKeys?: "throw" | "strip";
	validateResponses?: boolean;
};
