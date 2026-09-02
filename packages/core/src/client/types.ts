import type { Contract, RouteDeclaration } from "../contract/contract.ts";
import type { ClientRequest } from "../contract/request.ts";
import type {
	ClientResponseBody,
	DeclaredClientResponse,
} from "../contract/response.ts";
import type { ClientSseReceived } from "../contract/sseRouteBuilder.ts";
import type {
	ClientReceived,
	ClientSent,
	IsWebSocketRoute,
	WebSocketRouteDeclaration,
} from "../contract/websocketRouteBuilder.ts";

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

type HeaderRecord = Record<string, string>;

export type GetHeadersFn<THeaders extends HeaderRecord = HeaderRecord> = () =>
	| THeaders
	| Promise<THeaders>;

type LiteralKeys<T> = {
	[K in keyof T]: string extends K
		? never
		: number extends K
			? never
			: symbol extends K
				? never
				: K;
}[keyof T];

type GlobalHeaderKeys<TGlobalHeaders extends HeaderRecord> = LiteralKeys<
	Awaited<TGlobalHeaders>
>;

export type FetchArgs<
	E extends RouteDeclaration = RouteDeclaration,
	TGlobalHeaders extends HeaderRecord = Record<never, string>,
> =
	ClientRequest<E, GlobalHeaderKeys<TGlobalHeaders>> extends never
		? [options?: FetchOptions]
		: [
				request: ClientRequest<E, GlobalHeaderKeys<TGlobalHeaders>>,
				options?: FetchOptions,
			];

export type FetchFn<
	E extends RouteDeclaration,
	TGlobalHeaders extends HeaderRecord = Record<never, string>,
> = (...args: FetchArgs<E, TGlobalHeaders>) => Promise<ClientResponseBody<E>>;

type Simplify<T> = T extends unknown ? { [TKey in keyof T]: T[TKey] } : never;

type WithDeclaredResponseMetadata<TResponse, TMetadata> =
	TResponse extends unknown ? Simplify<TResponse & TMetadata> : never;

type RouteDeclaredResponse<E extends RouteDeclaration> =
	WithDeclaredResponseMetadata<
		DeclaredClientResponse<E>,
		{
			declared: true;
			headers: Headers;
		}
	>;

type StrictRouteDeclaredResponse<E extends RouteDeclaration> =
	WithDeclaredResponseMetadata<
		DeclaredClientResponse<E>,
		{
			headers: Headers;
		}
	>;

type RouteUndeclaredResponse = {
	declared: false;
	status: number;
	body: unknown;
	headers: Headers;
};

type IsStrictStatusRoute<E extends RouteDeclaration> = E extends {
	strictStatusCodes: true;
}
	? true
	: false;

/**
 * The response envelope returned by `fetchResponse()` for a route.
 *
 * @see {@link https://rest-rpc.dev/docs/client/fetch-client#fetchresponse}
 */
export type ClientResponse<E extends RouteDeclaration> = E extends {
	mode: "sse";
}
	? never
	: IsStrictStatusRoute<E> extends true
		? StrictRouteDeclaredResponse<E>
		: RouteDeclaredResponse<E> | Simplify<RouteUndeclaredResponse>;

export type FetchResponseFn<
	E extends RouteDeclaration,
	TGlobalHeaders extends HeaderRecord = Record<never, string>,
> = (...args: FetchArgs<E, TGlobalHeaders>) => Promise<ClientResponse<E>>;

export type OpenConnectionArgs<
	E extends RouteDeclaration = RouteDeclaration,
	TGlobalHeaders extends HeaderRecord = Record<never, string>,
> =
	ClientRequest<E, GlobalHeaderKeys<TGlobalHeaders>> extends never
		? []
		: [request: ClientRequest<E, GlobalHeaderKeys<TGlobalHeaders>>];

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

/**
 * The typed EventSource client returned by an SSE route's `openConnection()`.
 *
 * @see {@link https://rest-rpc.dev/docs/type-helpers#server-sent-events}
 */
export type ClientEventSource<E extends RouteDeclaration> = Pick<
	EventSource,
	"close" | "readyState" | "url"
> & {
	raw: EventSource;
	onOpen: (callback: (event: Event) => void) => () => void;
	onMessage: (callback: (message: ClientSseReceived<E>) => void) => () => void;
	onError: (callback: (event: Event) => void) => () => void;
};

export type OpenConnectionFn<
	E extends RouteDeclaration,
	TGlobalHeaders extends HeaderRecord = Record<never, string>,
> = (
	...args: OpenConnectionArgs<E, TGlobalHeaders>
) => E extends WebSocketRouteDeclaration
	? ClientSocket<E>
	: E extends { mode: "sse" }
		? ClientEventSource<E>
		: never;

type ApiClientMoreThanOneSuccessResponseRouteValue<
	E extends RouteDeclaration,
	TGlobalHeaders extends HeaderRecord,
> = {
	fetchResponse: FetchResponseFn<E, TGlobalHeaders>;
};

type ApiClientSingleSuccessResponseRouteValue<
	E extends RouteDeclaration,
	TGlobalHeaders extends HeaderRecord,
> = {
	fetch: FetchFn<E, TGlobalHeaders>;
	fetchResponse: FetchResponseFn<E, TGlobalHeaders>;
};

type ApiClientHttpRouteValue<
	E extends RouteDeclaration = RouteDeclaration,
	TGlobalHeaders extends HeaderRecord = Record<never, string>,
> =
	ClientResponseBody<E> extends never
		? ApiClientMoreThanOneSuccessResponseRouteValue<E, TGlobalHeaders>
		: ApiClientSingleSuccessResponseRouteValue<E, TGlobalHeaders>;

type ApiClientOpenConnectionRouteValue<
	E extends RouteDeclaration = RouteDeclaration,
	TGlobalHeaders extends HeaderRecord = Record<never, string>,
> = {
	openConnection: OpenConnectionFn<E, TGlobalHeaders>;
};

export type ApiClientRouteValue<
	E extends RouteDeclaration = RouteDeclaration,
	TGlobalHeaders extends HeaderRecord = Record<never, string>,
> = E extends RouteDeclaration
	? IsWebSocketRoute<E> extends true
		? ApiClientOpenConnectionRouteValue<E, TGlobalHeaders>
		: E extends { mode: "sse" }
			? ApiClientOpenConnectionRouteValue<E, TGlobalHeaders>
			: ApiClientHttpRouteValue<E, TGlobalHeaders>
	: never;

/**
 * Infers the generated client tree for a contract.
 *
 * @see {@link https://rest-rpc.dev/docs/type-helpers#fetch-client}
 */
export type ApiClientFor<
	T extends Contract = Contract,
	TGlobalHeaders extends HeaderRecord = Record<never, string>,
> = T extends RouteDeclaration
	? ApiClientRouteValue<T, TGlobalHeaders>
	: {
			[K in keyof T]: T[K] extends Contract
				? ApiClientFor<T[K], TGlobalHeaders>
				: never;
		};

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
export type ApiClientOptions<
	TGlobalHeaders extends HeaderRecord = Record<never, string>,
> = {
	baseUrl: string;
	fetch?: FetchLike;
	fetchOptions?: ApiClientFetchOptions;
	getGlobalHeaders?: GetHeadersFn<TGlobalHeaders>;
	nextFetchTags?: NextFetchTagsOptions;
	timeoutMs?: number;
	strictRequestKeys?: boolean;
	validateResponses?: boolean;
};
