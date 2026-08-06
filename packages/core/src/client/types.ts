import type {
	Contract,
	InferClientMessage,
	InferClientRequest,
	InferClientSuccessBody,
	InferClientResponse as InferDeclaredClientResponse,
	InferReceivedServerMessage,
	IsWebSocketRoute,
	RouteDeclaration,
	WebSocketRouteDeclaration,
} from "../contract/route.ts";

export type FetchOptions = Omit<RequestInit, "method" | "body" | "headers">;
export type ApiClientFetchOptions = Omit<FetchOptions, "signal">;

export type InferClientRequestInput<E extends RouteDeclaration> =
	InferClientRequest<E> extends never ? undefined : InferClientRequest<E>;

export type FetchArgs<E extends RouteDeclaration = RouteDeclaration> =
	InferClientRequest<E> extends never
		? [options?: FetchOptions]
		: [request: InferClientRequest<E>, options?: FetchOptions];

export type FetchFn<E extends RouteDeclaration> = (
	...args: FetchArgs<E>
) => Promise<InferClientSuccessBody<E>>;

export type UndeclaredRouteClientResponse = {
	declared: false;
	status: number;
	body: unknown;
	headers: Headers;
};

export type DeclaredRouteClientResponse<E extends RouteDeclaration> =
	InferDeclaredClientResponse<E> & {
		declared: true;
		headers: Headers;
	};

export type InferClientFetchResponse<E extends RouteDeclaration> =
	| DeclaredRouteClientResponse<E>
	| UndeclaredRouteClientResponse;

export type FetchResponseFn<E extends RouteDeclaration> = (
	...args: FetchArgs<E>
) => Promise<InferClientFetchResponse<E>>;

export type OpenConnectionArgs<E extends RouteDeclaration = RouteDeclaration> =
	InferClientRequest<E> extends never ? [] : [request: InferClientRequest<E>];

export type InferRouteClientSocket<E extends WebSocketRouteDeclaration> = Omit<
	WebSocket,
	"send"
> & {
	send: (message: InferClientMessage<E>) => void;
	onOpen: (callback: (event: Event) => void) => () => void;
	onMessage: (
		callback: (message: InferReceivedServerMessage<E>) => void,
	) => () => void;
	onError: (callback: (event: Event) => void) => () => void;
	onClose: (callback: (event: CloseEvent) => void) => () => void;
};

export type OpenConnectionFn<E extends RouteDeclaration> = (
	...args: OpenConnectionArgs<E>
) => E extends WebSocketRouteDeclaration ? InferRouteClientSocket<E> : never;

type ApiClientProtocolRouteValue<E extends RouteDeclaration> = {
	fetchResponse: FetchResponseFn<E>;
};

type ApiClientHappyPathRouteValue<E extends RouteDeclaration> = {
	fetch: FetchFn<E>;
	fetchResponse: FetchResponseFn<E>;
};

export type ApiClientHttpRouteValue<
	E extends RouteDeclaration = RouteDeclaration,
> =
	InferClientSuccessBody<E> extends never
		? ApiClientProtocolRouteValue<E>
		: ApiClientHappyPathRouteValue<E>;

export type ApiClientWebSocketRouteValue<
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

export type ApiClientOptions = {
	baseUrl: string;
	fetchOptions?: ApiClientFetchOptions;
	getHeaders?: GetHeadersFn;
	timeoutMs?: number;
	unknownRequestKeys?: "throw" | "strip";
	validateResponses?: boolean;
};

export type RuntimeArgs = Record<string, unknown>;
