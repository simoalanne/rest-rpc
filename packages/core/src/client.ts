import type {
	Contract,
	InferRouteClientMessage,
	InferRouteRequest,
	InferRouteResponse,
	InferRouteServerMessage,
	InferRouteSuccessBody,
	IsWebSocketRoute,
	RawRequestBody,
	RawRequestRouteDeclaration,
	ResponseBodySchema,
	RouteDeclaration,
	StreamResponse,
	WebSocketRouteDeclaration,
} from "./contracts.ts";
import {
	isNoBodyResponse,
	isStreamResponse,
	mapContractRoutes,
	mapObjectValues,
} from "./contracts.ts";

export type FetchOptions = Omit<RequestInit, "method" | "body" | "headers">;
export type ApiClientFetchOptions = Omit<FetchOptions, "signal">;

export type Merge<T> = T extends unknown ? { [K in keyof T]: T[K] } : never;

export type InferRouteClientRequest<E extends RouteDeclaration> =
	E extends RawRequestRouteDeclaration
		? Merge<
				(InferRouteRequest<E> extends never
					? Record<never, never>
					: InferRouteRequest<E>) & {
					rawBody: RawRequestBody;
				}
			>
		: InferRouteRequest<E>;

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
};

export type DeclaredRouteClientResponse<E extends RouteDeclaration> =
	InferRouteResponse<E> & {
		declared: true;
	};

export type InferRouteClientResponse<E extends RouteDeclaration> =
	| DeclaredRouteClientResponse<E>
	| UndeclaredRouteClientResponse;

export type FetchResponseFn<E extends RouteDeclaration> = (
	...args: FetchArgs<E>
) => Promise<InferRouteClientResponse<E>>;

export type ConnectArgs<E extends RouteDeclaration = RouteDeclaration> =
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
		callback: (result: InferRouteClientMessageResult<E>) => void,
	) => () => void;
	onError: (callback: (event: Event) => void) => () => void;
	onClose: (callback: (event: CloseEvent) => void) => () => void;
};

export type InferRouteClientMessageResult<E extends WebSocketRouteDeclaration> =
	| { success: true; data: InferRouteClientReceivedMessage<E> }
	| { success: false };

export type ConnectFn<E extends RouteDeclaration> = (
	...args: ConnectArgs<E>
) => E extends WebSocketRouteDeclaration ? InferRouteClientSocket<E> : never;

export type TryConnectFn<E extends RouteDeclaration> = (
	...args: ConnectArgs<E>
) => E extends WebSocketRouteDeclaration
	?
			| { success: true; data: InferRouteClientSocket<E> }
			| { success: false; error: unknown }
	: never;

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
	connect: ConnectFn<E>;
	tryConnect: TryConnectFn<E>;
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

export type ApiClientOptions = {
	baseUrl: string;
	fetchOptions?: ApiClientFetchOptions;
	getHeaders?: GetHeadersFn;
	timeoutMs?: number;
};

type RuntimeArgs = Record<string, unknown>;

const isApiClientRouteNode = (value: unknown): value is ApiClientRouteValue =>
	typeof value === "object" &&
	value !== null &&
	("fetchResponse" in value || "connect" in value);

const isRawRequestRouteNode = (
	route: RouteDeclaration,
): route is RawRequestRouteDeclaration => route.options?.mode === "raw";

const isWebSocketRouteNode = (
	route: RouteDeclaration,
): route is WebSocketRouteDeclaration => route.options?.mode === "websocket";

const isSuccessStatus = (status: number) => status >= 200 && status < 300;

const getSuccessfulResponseStatuses = (route: RouteDeclaration) => {
	if (!("responses" in route)) return [];

	return Object.keys(route.responses).map(Number).filter(isSuccessStatus);
};

const hasSingleSuccessfulResponse = (route: RouteDeclaration) =>
	getSuccessfulResponseStatuses(route).length === 1;

const createRequestSignal = (
	signal: RequestInit["signal"],
	timeoutMs: number | undefined,
) => {
	if (!timeoutMs) return null;

	const timeoutController = new AbortController();
	const timeoutId = setTimeout(() => timeoutController.abort(), timeoutMs);

	return {
		signal: signal
			? AbortSignal.any([signal, timeoutController.signal])
			: timeoutController.signal,
		cleanup: () => clearTimeout(timeoutId),
	};
};

const takesRequestInput = (route: RouteDeclaration) =>
	Boolean(route.request) || isRawRequestRouteNode(route);

type GetHeadersFn = () =>
	| Record<string, string>
	| Promise<Record<string, string>>;

export const mapApiClientContract = (
	apiClient: ApiClientFor<Contract>,
	mappingFn: (leaf: ApiClientRouteValue, path: string[]) => unknown,
) => mapObjectValues(apiClient, isApiClientRouteNode, mappingFn);

export class ApiClient<TContract extends Contract = Contract> {
	readonly api: ApiClientFor<TContract>;

	private baseUrl: string;
	private contract: TContract;
	private fetchOptions?: ApiClientFetchOptions;
	private getHeaders?: GetHeadersFn;
	private timeoutMs?: number;

	constructor(contract: TContract, options: ApiClientOptions) {
		this.baseUrl = options.baseUrl;
		this.contract = contract;
		this.fetchOptions = options.fetchOptions;
		this.getHeaders = options.getHeaders;
		this.timeoutMs = options.timeoutMs;

		this.api = this.buildApiClient();
	}

	private groupKeysToRequest(args: RuntimeArgs, contract: RouteDeclaration) {
		const keyMap = new Map<string, "query" | "params">();
		(["query", "params"] as const).forEach((type) => {
			const keys = Object.keys(contract.request?.[type]?.shape ?? {});
			keys.forEach((key) => {
				keyMap.set(key, type);
			});
		});

		return Object.entries(args).reduce(
			(acc, [k, v]) => {
				if (k === "rawBody") {
					acc.rawBody = v as RawRequestBody;
					return acc;
				}

				const bucket = keyMap.get(k);
				if (bucket) {
					if (!acc[bucket]) acc[bucket] = {};
					acc[bucket][k] = v;
					return acc;
				}

				if (contract.request?.body) {
					if (!acc.body) acc.body = {};
					acc.body[k] = v;
				}

				return acc;
			},
			{} as {
				body?: Record<string, unknown>;
				query?: Record<string, unknown>;
				params?: Record<string, unknown>;
				rawBody?: RawRequestBody;
			},
		);
	}

	private constructBaseRequest(
		contract: RouteDeclaration,
		args?: RuntimeArgs,
	): { url: string; body?: BodyInit | null } {
		let urlBase = `${this.baseUrl}${contract.path}`;
		if (!args) return { url: urlBase };

		const { body, query, params, rawBody } = this.groupKeysToRequest(
			args,
			contract,
		);
		if (params) {
			for (const [k, v] of Object.entries(params)) {
				urlBase = urlBase.replace(`:${k}`, encodeURIComponent(String(v)));
			}
		}

		if (query) {
			Object.entries(query).forEach(([k, v]) => {
				if (v === undefined || v === null) {
					delete query[k];
				}
			});

			urlBase += `?${new URLSearchParams(query as Record<string, string>)}`;
		}

		if (isRawRequestRouteNode(contract)) {
			return { url: urlBase, body: rawBody as BodyInit | null | undefined };
		}

		return {
			url: urlBase,
			body: body ? JSON.stringify(body) : undefined,
		};
	}

	private extractArgs(contract: RouteDeclaration, args: unknown[]) {
		const requestArgs = takesRequestInput(contract) ? args[0] : undefined;
		const options = requestArgs ? args[1] : args[0];
		return { requestArgs, options } as {
			requestArgs?: unknown;
			options?: FetchOptions;
		};
	}

	private async request<E extends RouteDeclaration>(
		contract: E,
		...args: FetchArgs<E>
	): Promise<{ rawResponse: Response; cleanup: () => void }> {
		const { requestArgs, options } = this.extractArgs(contract, args);
		const { url, body } = this.constructBaseRequest(
			contract,
			requestArgs as RuntimeArgs,
		);

		const signalState = createRequestSignal(options?.signal, this.timeoutMs);
		const headers = (await this.getHeaders?.()) ?? {};

		try {
			const rawResponse = await fetch(url, {
				...this.fetchOptions,
				...options,
				method: contract.method,
				body,
				headers: {
					...headers,
					...(body && !isRawRequestRouteNode(contract)
						? { "Content-Type": "application/json" }
						: {}),
				},
				signal: signalState?.signal ?? options?.signal,
			});

			return {
				rawResponse,
				cleanup: () => signalState?.cleanup(),
			};
		} catch (error) {
			signalState?.cleanup();
			throw error;
		}
	}

	private getResponseSchema(
		contract: RouteDeclaration,
		status: number,
	): ResponseBodySchema | undefined {
		if (!("responses" in contract)) return undefined;
		const entry = Object.entries(contract.responses).find(
			([declaredStatus]) => Number(declaredStatus) === status,
		);
		return entry?.[1];
	}

	private async readUnknownBody(rawResponse: Response) {
		const text = await rawResponse.text();
		if (!text) return undefined;

		try {
			return JSON.parse(text) as unknown;
		} catch {
			return text;
		}
	}

	private async readDeclaredBody(
		schema: ResponseBodySchema,
		rawResponse: Response,
	) {
		if (isNoBodyResponse(schema)) return undefined;

		if (isStreamResponse(schema)) {
			if (!rawResponse.body) {
				throw new Error("Backend returned an empty stream response");
			}

			return this.parseNdjsonStream(schema, rawResponse.body);
		}

		return schema.parse(await rawResponse.json());
	}

	private async fetchResponse<E extends RouteDeclaration>(
		contract: E,
		...args: FetchArgs<E>
	): Promise<InferRouteClientResponse<E>> {
		const { rawResponse, cleanup } = await this.request(contract, ...args);

		try {
			const schema = this.getResponseSchema(contract, rawResponse.status);
			if (!schema) {
				return {
					declared: false,
					status: rawResponse.status,
					body: await this.readUnknownBody(rawResponse),
				} as InferRouteClientResponse<E>;
			}

			return {
				declared: true,
				status: rawResponse.status,
				body: await this.readDeclaredBody(schema, rawResponse),
			} as InferRouteClientResponse<E>;
		} finally {
			cleanup();
		}
	}

	private async fetch<E extends RouteDeclaration>(
		contract: E,
		...args: FetchArgs<E>
	): Promise<InferRouteSuccessBody<E>> {
		const response = await this.fetchResponse(contract, ...args);

		if (!response.declared || !isSuccessStatus(response.status)) {
			throw new Error("Request did not return a declared success response");
		}

		return response.body as InferRouteSuccessBody<E>;
	}

	private async *parseNdjsonStream(
		response: StreamResponse,
		body: ReadableStream<Uint8Array>,
	): AsyncIterable<unknown> {
		const reader = body.getReader();
		const decoder = new TextDecoder();
		let buffer = "";

		try {
			while (true) {
				const { done, value } = await reader.read();
				if (done) break;

				buffer += decoder.decode(value, { stream: true });
				const lines = buffer.split("\n");
				buffer = lines.pop() ?? "";

				for (const line of lines) {
					if (!line.trim()) continue;
					yield response.schema.parse(JSON.parse(line));
				}
			}

			buffer += decoder.decode();
			if (buffer.trim()) {
				yield response.schema.parse(JSON.parse(buffer));
			}
		} finally {
			reader.releaseLock();
		}
	}

	private buildWebSocketUrl(url: string) {
		if (url.startsWith("http:")) return url.replace("http:", "ws:");
		return url.replace("https:", "wss:");
	}

	private connect<E extends WebSocketRouteDeclaration>(
		contract: E,
		...args: ConnectArgs<E>
	): InferRouteClientSocket<E> {
		if (typeof WebSocket === "undefined") {
			throw new Error("WebSocket is not available in this runtime");
		}

		const requestArgs = takesRequestInput(contract) ? args[0] : undefined;
		const { url } = this.constructBaseRequest(
			contract,
			requestArgs as RuntimeArgs,
		);
		const rawSocket = new WebSocket(this.buildWebSocketUrl(url));
		const rawSend = rawSocket.send.bind(rawSocket);
		const socket = rawSocket as InferRouteClientSocket<E>;

		const parseIncomingMessage = (
			data: unknown,
		): InferRouteClientMessageResult<E> => {
			try {
				return {
					success: true,
					data: contract.messages.server.parse(
						JSON.parse(data as string),
					) as InferRouteServerMessage<E>,
				};
			} catch {
				return {
					success: false,
				};
			}
		};

		socket.send = (message: InferRouteClientMessage<E>) => {
			if (socket.readyState !== WebSocket.OPEN) {
				throw new Error("WebSocket is not open");
			}

			rawSend(JSON.stringify(message));
		};

		socket.onOpen = (callback: (event: Event) => void) => {
			socket.addEventListener("open", callback);
			return () => socket.removeEventListener("open", callback);
		};

		socket.onClose = (callback: (event: CloseEvent) => void) => {
			socket.addEventListener("close", callback);
			return () => socket.removeEventListener("close", callback);
		};

		socket.onError = (callback: (event: Event) => void) => {
			socket.addEventListener("error", callback);
			return () => socket.removeEventListener("error", callback);
		};

		socket.onMessage = (
			callback: (result: InferRouteClientMessageResult<E>) => void,
		) => {
			const onMessage = (event: MessageEvent) => {
				callback(parseIncomingMessage(event.data));
			};

			socket.addEventListener("message", onMessage);
			return () => socket.removeEventListener("message", onMessage);
		};

		return socket;
	}

	private tryConnect<E extends WebSocketRouteDeclaration>(
		contract: E,
		...args: ConnectArgs<E>
	) {
		try {
			const data = this.connect(contract, ...args);
			return { success: true, data } as const;
		} catch (error) {
			return { success: false, error } as const;
		}
	}

	private buildApiClient = () =>
		mapContractRoutes(this.contract, (node) => {
			if (isWebSocketRouteNode(node)) {
				return {
					connect: (...args: ConnectArgs<typeof node>) =>
						this.connect(node, ...args),
					tryConnect: (...args: ConnectArgs<typeof node>) =>
						this.tryConnect(node, ...args),
				};
			}

			const fetchResponse = (...args: FetchArgs<typeof node>) =>
				this.fetchResponse(node, ...args);

			if (!hasSingleSuccessfulResponse(node)) {
				return {
					fetchResponse,
				};
			}

			return {
				fetch: (...args: FetchArgs<typeof node>) => this.fetch(node, ...args),
				fetchResponse,
			};
		}) as ApiClientFor<TContract>;
}

export const initClient = <TContract extends Contract>(
	contract: TContract,
	options: ApiClientOptions,
): ApiClientFor<TContract> => new ApiClient(contract, options).api;
