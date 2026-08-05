import type {
	Contract,
	InferRouteClientMessage,
	InferRouteRequest,
	InferRouteResponse,
	InferRouteServerMessage,
	InferRouteSuccessBody,
	IsWebSocketRoute,
	RouteDeclaration,
	WebSocketRouteDeclaration,
} from "../contract/route.ts";

export type FetchOptions = Omit<RequestInit, "method" | "body" | "headers">;
export type ApiClientFetchOptions = Omit<FetchOptions, "signal">;

export type InferRouteClientRequest<E extends RouteDeclaration> =
	InferRouteRequest<E>;

export type InferRouteClientRequestInput<E extends RouteDeclaration> =
	InferRouteClientRequest<E> extends never
		? undefined
		: InferRouteClientRequest<E>;

export type FetchArgs<E extends RouteDeclaration = RouteDeclaration> =
	InferRouteClientRequest<E> extends never
		? [options?: FetchOptions]
		: [request: InferRouteClientRequest<E>, options?: FetchOptions];

export type FetchFn<E extends RouteDeclaration> = (
	...args: FetchArgs<E>
) => Promise<InferRouteSuccessBody<E>>;

export type UndeclaredRouteClientResponse = {
	declared: false;
	status: number;
	body: unknown;
	headers: Headers;
};

export type DeclaredRouteClientResponse<E extends RouteDeclaration> =
	InferRouteResponse<E> & {
		declared: true;
		headers: Headers;
	};

export type InferRouteClientResponse<E extends RouteDeclaration> =
	| DeclaredRouteClientResponse<E>
	| UndeclaredRouteClientResponse;

export type FetchResponseFn<E extends RouteDeclaration> = (
	...args: FetchArgs<E>
) => Promise<InferRouteClientResponse<E>>;

export type OpenConnectionArgs<E extends RouteDeclaration = RouteDeclaration> =
	InferRouteRequest<E> extends never ? [] : [request: InferRouteRequest<E>];

export type InferRouteClientSendMessage<E extends WebSocketRouteDeclaration> =
	InferRouteClientMessage<E>;

export type InferRouteClientReceivedMessage<
	E extends WebSocketRouteDeclaration,
> = InferRouteServerMessage<E>;

export type InferRouteClientSocket<E extends WebSocketRouteDeclaration> = Omit<
	WebSocket,
	"send"
> & {
	send: (message: InferRouteClientSendMessage<E>) => void;
	onOpen: (callback: (event: Event) => void) => () => void;
	onMessage: (
		callback: (message: InferRouteClientReceivedMessage<E>) => void,
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
	InferRouteSuccessBody<E> extends never
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

export type RuntimeValidation = "incoming" | "incoming-and-outgoing";

export type ApiClientOptions = {
	baseUrl: string;
	fetchOptions?: ApiClientFetchOptions;
	getHeaders?: GetHeadersFn;
	timeoutMs?: number;
	unknownRequestKeys?: "throw" | "strip";
	validation?: RuntimeValidation;
};

export type RuntimeArgs = Record<string, unknown>;
