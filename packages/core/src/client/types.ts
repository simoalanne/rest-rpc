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
	ClientResponse,
	ClientSuccessBody,
} from "../contract/response.ts";

export type FetchOptions = Omit<RequestInit, "method" | "body" | "headers">;
export type ApiClientFetchOptions = Omit<FetchOptions, "signal">;
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
) => Promise<ClientSuccessBody<E>>;

export type UndeclaredRouteClientResponse = {
	declared: false;
	status: number;
	body: unknown;
	headers: Headers;
};

export type DeclaredRouteClientResponse<E extends RouteDeclaration> =
	ClientResponse<E> & {
		declared: true;
		headers: Headers;
	};

export type ClientFetchResponse<E extends RouteDeclaration> =
	| DeclaredRouteClientResponse<E>
	| UndeclaredRouteClientResponse;

export type FetchResponseFn<E extends RouteDeclaration> = (
	...args: FetchArgs<E>
) => Promise<ClientFetchResponse<E>>;

export type OpenConnectionArgs<E extends RouteDeclaration = RouteDeclaration> =
	ClientRequest<E> extends never ? [] : [request: ClientRequest<E>];

export type ClientSocket<E extends WebSocketRouteDeclaration> = Omit<
	WebSocket,
	"send"
> & {
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
	ClientSuccessBody<E> extends never
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

export type ApiClientFor<T extends Contract = Contract> =
	T extends RouteDeclaration
		? ApiClientRouteValue<T>
		: {
				[K in keyof T]: T[K] extends Contract ? ApiClientFor<T[K]> : never;
			};

export type GetHeadersFn = () =>
	| Record<string, string>
	| Promise<Record<string, string>>;

export type NextFetchTagsOptions = {
	enabled: boolean;
	tagPrefix?: string;
};

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
