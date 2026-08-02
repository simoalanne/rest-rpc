import type {
	Contract,
	ContractClientMessage,
	ContractRequest,
	ContractResponse,
	ContractServerMessage,
	ContractSingleSuccessfulResponseBody,
	ContractTree,
	IsWebSocketContract,
	RawRequestBody,
	RawRequestContract,
	ResponseBodySchema,
	StreamResponse,
	WebSocketContract,
} from "./contracts.ts";
import {
	isNoBodyResponse,
	isStreamResponse,
	mapContractTree,
	mapObjectValues,
} from "./contracts.ts";

export type FetchOptions = Omit<RequestInit, "method" | "body" | "headers">;
export type ApiClientFetchOptions = Omit<FetchOptions, "signal">;

export type Merge<T> = T extends unknown ? { [K in keyof T]: T[K] } : never;

export type ClientRequest<E extends Contract> = E extends RawRequestContract
	? Merge<
			(ContractRequest<E> extends never
				? Record<never, never>
				: ContractRequest<E>) & {
				rawBody: RawRequestBody;
			}
		>
	: ContractRequest<E>;

export type RequestInput<E extends Contract> =
	ClientRequest<E> extends never ? void : ClientRequest<E>;

export type FetchArgs<E extends Contract = Contract> =
	ClientRequest<E> extends never
		? [options?: FetchOptions]
		: [request: ClientRequest<E>, options?: FetchOptions];

export type FetchFn<E extends Contract> = (
	...args: FetchArgs<E>
) => Promise<ContractSingleSuccessfulResponseBody<E>>;

export type UndeclaredClientResponse = {
	declared: false;
	status: number;
	body: unknown;
};

export type DeclaredClientResponse<E extends Contract> = ContractResponse<E> & {
	declared: true;
};

export type ClientResponse<E extends Contract> =
	| DeclaredClientResponse<E>
	| UndeclaredClientResponse;

export type FetchResponseFn<E extends Contract> = (
	...args: FetchArgs<E>
) => Promise<ClientResponse<E>>;

export type ConnectArgs<E extends Contract = Contract> =
	ContractRequest<E> extends never ? [] : [request: ContractRequest<E>];

export type ContractWebSocket<E extends WebSocketContract> = Omit<
	WebSocket,
	"send"
> & {
	send: (message: ContractClientMessage<E>) => void;
	onOpen: (callback: (event: Event) => void) => () => void;
	onMessage: (
		callback: (result: WebSocketMessageResult<E>) => void,
	) => () => void;
	onError: (callback: (event: Event) => void) => () => void;
	onClose: (callback: (event: CloseEvent) => void) => () => void;
};

export type WebSocketMessageResult<E extends WebSocketContract> =
	| { success: true; data: ContractServerMessage<E> }
	| { success: false };

export type ConnectFn<E extends Contract> = (
	...args: ConnectArgs<E>
) => E extends WebSocketContract ? ContractWebSocket<E> : never;

export type TryConnectFn<E extends Contract> = (
	...args: ConnectArgs<E>
) => E extends WebSocketContract
	?
			| { success: true; data: ContractWebSocket<E> }
			| { success: false; error: unknown }
	: never;

type ApiClientProtocolContractValue<E extends Contract> = {
	fetchResponse: FetchResponseFn<E>;
};

type ApiClientHappyPathContractValue<E extends Contract> = {
	fetch: FetchFn<E>;
	fetchResponse: FetchResponseFn<E>;
};

export type ApiClientHttpContractValue<E extends Contract = Contract> =
	ContractSingleSuccessfulResponseBody<E> extends never
		? ApiClientProtocolContractValue<E>
		: ApiClientHappyPathContractValue<E>;

export type ApiClientWebSocketContractValue<E extends Contract = Contract> = {
	connect: ConnectFn<E>;
	tryConnect: TryConnectFn<E>;
};

export type ApiClientContractValue<E extends Contract = Contract> =
	E extends Contract
		? IsWebSocketContract<E> extends true
			? ApiClientWebSocketContractValue<E>
			: ApiClientHttpContractValue<E>
		: never;

export type ApiClientTree<T extends ContractTree = ContractTree> =
	T extends Contract
		? ApiClientContractValue<T>
		: {
				[K in keyof T]: T[K] extends ContractTree ? ApiClientTree<T[K]> : never;
			};

export type ApiClientOptions = {
	baseUrl: string;
	fetchOptions?: ApiClientFetchOptions;
	getHeaders?: GetHeadersFn;
	timeoutMs?: number;
};

type RuntimeArgs = Record<string, unknown>;

const isApiClientContractNode = (
	value: unknown,
): value is ApiClientContractValue =>
	typeof value === "object" &&
	value !== null &&
	("fetchResponse" in value || "connect" in value);

const isRawRequestContractNode = (
	contract: Contract,
): contract is RawRequestContract => contract.options?.mode === "raw";

const isWebSocketContractNode = (
	contract: Contract,
): contract is WebSocketContract => contract.options?.mode === "websocket";

const isSuccessStatus = (status: number) => status >= 200 && status < 300;

const getSuccessfulResponseStatuses = (contract: Contract) => {
	if (!("responses" in contract)) return [];

	return Object.keys(contract.responses).map(Number).filter(isSuccessStatus);
};

const hasSingleSuccessfulResponse = (contract: Contract) =>
	getSuccessfulResponseStatuses(contract).length === 1;

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

const takesRequestInput = (contract: Contract) =>
	Boolean(contract.request) || isRawRequestContractNode(contract);

type GetHeadersFn = () =>
	| Record<string, string>
	| Promise<Record<string, string>>;

export const mapApiClientTree = (
	tree: ApiClientTree<ContractTree>,
	mappingFn: (leaf: ApiClientContractValue, path: string[]) => unknown,
) => mapObjectValues(tree, isApiClientContractNode, mappingFn);

export class ApiClient<TTree extends ContractTree = ContractTree> {
	readonly api: ApiClientTree<TTree>;

	private baseUrl: string;
	private contracts: TTree;
	private fetchOptions?: ApiClientFetchOptions;
	private getHeaders?: GetHeadersFn;
	private timeoutMs?: number;

	constructor(contracts: TTree, options: ApiClientOptions) {
		this.baseUrl = options.baseUrl;
		this.contracts = contracts;
		this.fetchOptions = options.fetchOptions;
		this.getHeaders = options.getHeaders;
		this.timeoutMs = options.timeoutMs;

		this.api = this.buildApiClient();
	}

	private groupKeysToRequest(args: RuntimeArgs, contract: Contract) {
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
		contract: Contract,
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

		if (isRawRequestContractNode(contract)) {
			return { url: urlBase, body: rawBody as BodyInit | null | undefined };
		}

		return {
			url: urlBase,
			body: body ? JSON.stringify(body) : undefined,
		};
	}

	private extractArgs(contract: Contract, args: unknown[]) {
		const requestArgs = takesRequestInput(contract) ? args[0] : undefined;
		const options = requestArgs ? args[1] : args[0];
		return { requestArgs, options } as {
			requestArgs?: unknown;
			options?: FetchOptions;
		};
	}

	private async request<E extends Contract>(
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
					...(body && !isRawRequestContractNode(contract)
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
		contract: Contract,
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

	private async fetchResponse<E extends Contract>(
		contract: E,
		...args: FetchArgs<E>
	): Promise<ClientResponse<E>> {
		const { rawResponse, cleanup } = await this.request(contract, ...args);

		try {
			const schema = this.getResponseSchema(contract, rawResponse.status);
			if (!schema) {
				return {
					declared: false,
					status: rawResponse.status,
					body: await this.readUnknownBody(rawResponse),
				} as ClientResponse<E>;
			}

			return {
				declared: true,
				status: rawResponse.status,
				body: await this.readDeclaredBody(schema, rawResponse),
			} as ClientResponse<E>;
		} finally {
			cleanup();
		}
	}

	private async fetch<E extends Contract>(
		contract: E,
		...args: FetchArgs<E>
	): Promise<ContractSingleSuccessfulResponseBody<E>> {
		const response = await this.fetchResponse(contract, ...args);

		if (!response.declared || !isSuccessStatus(response.status)) {
			throw new Error("Request did not return a declared success response");
		}

		return response.body as ContractSingleSuccessfulResponseBody<E>;
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

	private connect<E extends WebSocketContract>(
		contract: E,
		...args: ConnectArgs<E>
	): ContractWebSocket<E> {
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
		const socket = rawSocket as ContractWebSocket<E>;

		const parseIncomingMessage = (data: unknown): WebSocketMessageResult<E> => {
			try {
				return {
					success: true,
					data: contract.messages.server.parse(
						JSON.parse(data as string),
					) as ContractServerMessage<E>,
				};
			} catch {
				return {
					success: false,
				};
			}
		};

		socket.send = (message: ContractClientMessage<E>) => {
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
			callback: (result: WebSocketMessageResult<E>) => void,
		) => {
			const onMessage = (event: MessageEvent) => {
				callback(parseIncomingMessage(event.data));
			};

			socket.addEventListener("message", onMessage);
			return () => socket.removeEventListener("message", onMessage);
		};

		return socket;
	}

	private tryConnect<E extends WebSocketContract>(
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
		mapContractTree(this.contracts, (node) => {
			if (isWebSocketContractNode(node)) {
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
		}) as ApiClientTree<TTree>;
}

export const initClient = <TTree extends ContractTree>(
	contracts: TTree,
	options: ApiClientOptions,
): ApiClientTree<TTree> =>
	new ApiClient(contracts, options).api;
