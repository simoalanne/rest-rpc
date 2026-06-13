import type {
	Contract,
	ContractClientMessage,
	ContractError,
	ContractRequest,
	ContractResponse,
	ContractServerMessage,
	ContractTree,
	IsStreamContract,
	IsWebSocketContract,
	JsonContract,
	RawRequestBody,
	RawRequestContract,
	StreamContract,
	WebSocketContract,
} from "@contract-first-api/core/contracts";
import {
	mapContractTree,
	mapObjectValues,
} from "@contract-first-api/core/contracts";

export type FetchOptions = Omit<RequestInit, "method" | "body" | "headers">;
export type ApiClientFetchOptions = Omit<FetchOptions, "signal">;

export type ApiClientUnknownError = {
	code: "unknown";
	status?: number;
	message?: string;
};

export type ApiClientError<E extends Contract> =
	| (ContractError<E> & { status?: number })
	| ApiClientUnknownError;

type Merge<T> = T extends unknown ? { [K in keyof T]: T[K] } : never;

type ClientRequest<E extends Contract> = E extends RawRequestContract
	? Merge<
			(ContractRequest<E> extends never ? Record<never, never> : ContractRequest<E>) & {
				rawBody: RawRequestBody;
			}
		>
	: ContractRequest<E>;

export type FetchArgs<E extends Contract = Contract> =
	ClientRequest<E> extends never
		? [options?: FetchOptions]
		: [request: ClientRequest<E>, options?: FetchOptions];

export type FetchFn<E extends Contract> = (
	...args: FetchArgs<E>
) => Promise<ContractResponse<E>>;

export type StreamFn<E extends Contract> = (
	...args: FetchArgs<E>
) => Promise<ContractResponse<E>>;

export type StreamData<E extends Contract> =
	ContractResponse<E> extends AsyncIterable<infer TData>
		? TData
		: ContractResponse<E>;

export type SubscribeCallbackFunctions<E extends Contract> = {
	onData: (data: StreamData<E>) => void;
	onError: (error: ApiClientError<E>) => void;
};

export type SubscribeFn<E extends Contract> = (
	...args: ContractRequest<E> extends never
		? [callbacks: SubscribeCallbackFunctions<E>]
		: [request: ContractRequest<E>, callbacks: SubscribeCallbackFunctions<E>]
) => () => void;

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

export type ApiClientResult<E extends Contract, TData> =
	| { success: true; data: TData }
	| { success: false; error: ApiClientError<E> };

export type ApiResult<E extends Contract> = ApiClientResult<
	E,
	ContractResponse<E>
>;

export type TryFetchFn<E extends Contract> = (
	...args: FetchArgs<E>
) => Promise<ApiResult<E>>;

export type TryStreamFn<E extends Contract> = (
	...args: FetchArgs<E>
) => Promise<ApiResult<E>>;

export type TrySubscribeFn<E extends Contract> = (
	...args: Parameters<SubscribeFn<E>>
) => E extends StreamContract ? ApiClientResult<E, () => void> : never;

export type TryConnectFn<E extends Contract> = (
	...args: ConnectArgs<E>
) => E extends WebSocketContract
	? ApiClientResult<E, ContractWebSocket<E>>
	: never;

export type ApiClientJsonContractValue<E extends Contract = Contract> = {
	fetch: FetchFn<E>;
	tryFetch: TryFetchFn<E>;
	$contract: E;
};

export type ApiClientStreamContractValue<E extends Contract = Contract> = {
	stream: StreamFn<E>;
	tryStream: TryStreamFn<E>;
	subscribe: SubscribeFn<E>;
	trySubscribe: TrySubscribeFn<E>;
	$contract: E;
};

export type ApiClientWebSocketContractValue<E extends Contract = Contract> = {
	connect: ConnectFn<E>;
	tryConnect: TryConnectFn<E>;
	$contract: E;
};

export type ApiClientContractValue<E extends Contract = Contract> =
	E extends Contract
		? IsStreamContract<E> extends true
			? ApiClientStreamContractValue<E>
			: IsWebSocketContract<E> extends true
				? ApiClientWebSocketContractValue<E>
				: ApiClientJsonContractValue<E>
		: never;

export type ApiClientTree<T extends ContractTree = ContractTree> =
	T extends Contract
		? ApiClientContractValue<T>
		: {
				[K in keyof T]: T[K] extends ContractTree ? ApiClientTree<T[K]> : never;
			};

export type ApiClientOptions<TTree extends ContractTree> = {
	baseUrl: string;
	contracts: TTree;
	fetchOptions?: ApiClientFetchOptions;
	timeoutMs?: number;
};

type RuntimeArgs = Record<string, unknown>;

const isApiClientContractNode = (
	value: unknown,
): value is ApiClientContractValue =>
	typeof value === "object" &&
	value !== null &&
	"$contract" in value &&
	("fetch" in value || "stream" in value || "connect" in value);

const isStreamContractNode = (contract: Contract): contract is StreamContract =>
	contract.options?.mode === "stream";

const isRawRequestContractNode = (
	contract: Contract,
): contract is RawRequestContract => contract.options?.mode === "raw";

const isWebSocketContractNode = (
	contract: Contract,
): contract is WebSocketContract => contract.options?.mode === "websocket";

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
	api: ApiClientTree<TTree>;

	private baseUrl: string;
	private contracts: TTree;
	private fetchOptions?: ApiClientFetchOptions;
	private getHeaders?: GetHeadersFn;
	private timeoutMs?: number;

	setHeaders = (getHeaders: GetHeadersFn) => {
		this.getHeaders = getHeaders;
	};

	constructor(options: ApiClientOptions<TTree>) {
		this.baseUrl = options.baseUrl;
		this.contracts = options.contracts;
		this.fetchOptions = options.fetchOptions;
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

	private extractSubscribeArgs(contract: Contract, args: unknown[]) {
		const requestArgs = takesRequestInput(contract) ? args[0] : undefined;
		const callbacks = requestArgs ? args[1] : args[0];
		return { requestArgs, callbacks } as {
			requestArgs?: unknown;
			callbacks: SubscribeCallbackFunctions<Contract>;
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

			if (!rawResponse.ok) {
				const errorPayload = await rawResponse.json().catch(() => null);
				for (const schema of [contract.errors ?? []].flat()) {
					const result = schema.safeParse(errorPayload);
					if (result.success) throw result.data;
				}
				throw {
					code: "unknown",
					status: rawResponse.status,
					message: errorPayload?.message ?? rawResponse.statusText,
				};
			}

			return {
				rawResponse,
				cleanup: () => signalState?.cleanup(),
			};
		} catch (error) {
			signalState?.cleanup();
			throw error;
		}
	}

	private async fetch<E extends JsonContract | RawRequestContract>(
		contract: E,
		...args: FetchArgs<E>
	): Promise<ContractResponse<E>> {
		const { rawResponse, cleanup } = await this.request(contract, ...args);

		try {
			if (!contract.response) {
				return undefined as ContractResponse<E>;
			}
			const response = await rawResponse.json().catch(() => null);

			const parsedResponse = contract.response.safeParse(response);
			if (!parsedResponse.success) {
				throw {
					code: "unknown",
					message: "Backend returned its response in an unexpected format",
				};
			}

			return parsedResponse.data as ContractResponse<E>;
		} finally {
			cleanup();
		}
	}

	private async stream<E extends StreamContract>(
		contract: E,
		...args: FetchArgs<E>
	): Promise<ContractResponse<E>> {
		const { rawResponse, cleanup } = await this.request(contract, ...args);

		if (!rawResponse.body) {
			cleanup();
			throw {
				code: "unknown",
				status: rawResponse.status,
				message: "Backend returned an empty stream response",
			};
		}

		cleanup();
		return this.parseNdjsonStream(
			contract,
			rawResponse.body,
		) as unknown as ContractResponse<E>;
	}

	private async *parseNdjsonStream(
		contract: StreamContract,
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
					yield this.parseStreamLine(contract, line);
				}
			}

			buffer += decoder.decode();
			if (buffer.trim()) {
				yield this.parseStreamLine(contract, buffer);
			}
		} finally {
			reader.releaseLock();
		}
	}

	private parseStreamLine(contract: StreamContract, line: string) {
		try {
			return contract.response.parse(JSON.parse(line));
		} catch {
			throw {
				code: "unknown",
				message: "Backend returned a stream chunk in an unexpected format",
			};
		}
	}

	private subscribe<E extends StreamContract>(
		contract: E,
		...args: Parameters<SubscribeFn<E>>
	) {
		const { requestArgs, callbacks } = this.extractSubscribeArgs(
			contract,
			args,
		);
		const controller = new AbortController();

		const streamArgs = (takesRequestInput(contract)
			? [requestArgs, { signal: controller.signal }]
			: [{ signal: controller.signal }]) as unknown as FetchArgs<E>;

		void this.consumeStream(contract, callbacks, controller.signal, streamArgs);

		return () => controller.abort();
	}

	private trySubscribe<E extends StreamContract>(
		contract: E,
		...args: Parameters<SubscribeFn<E>>
	): ApiClientResult<E, () => void> {
		try {
			const data = this.subscribe(contract, ...args);
			return { success: true, data };
		} catch (error) {
			return { success: false, error: error as ApiClientError<E> };
		}
	}

	private async consumeStream<E extends StreamContract>(
		contract: E,
		callbacks: SubscribeCallbackFunctions<E>,
		signal: AbortSignal,
		args: unknown[],
	) {
		try {
			const stream = (await this.stream(
				contract,
				...(args as FetchArgs<E>),
			)) as unknown as AsyncIterable<unknown>;
			for await (const data of stream) {
				callbacks.onData(data as StreamData<E>);
			}
		} catch (error) {
			if (signal.aborted) return;
			callbacks.onError(error as ApiClientError<E>);
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
			throw {
				code: "unknown",
				message: "WebSocket is not available in this runtime",
			};
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
				throw {
					code: "unknown",
					message: "WebSocket is not open",
				};
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

	private async tryFetch<E extends JsonContract | RawRequestContract>(
		contract: E,
		...args: FetchArgs<E>
	): Promise<ApiResult<E>> {
		try {
			const data = await this.fetch(contract, ...args);
			return { success: true, data };
		} catch (error) {
			return { success: false, error: error as ApiClientError<E> };
		}
	}

	private async tryStream<E extends StreamContract>(
		contract: E,
		...args: FetchArgs<E>
	): Promise<ApiResult<E>> {
		try {
			const data = await this.stream(contract, ...args);
			return { success: true, data };
		} catch (error) {
			return { success: false, error: error as ApiClientError<E> };
		}
	}

	private tryConnect<E extends WebSocketContract>(
		contract: E,
		...args: ConnectArgs<E>
	): ApiClientResult<E, ContractWebSocket<E>> {
		try {
			const data = this.connect(contract, ...args);
			return { success: true, data };
		} catch (error) {
			return { success: false, error: error as ApiClientError<E> };
		}
	}

	private buildApiClient = () =>
		mapContractTree(this.contracts, (node) => {
			if (isWebSocketContractNode(node)) {
				return {
					$contract: node,
					connect: (...args: ConnectArgs<typeof node>) =>
						this.connect(node, ...args),
					tryConnect: (...args: ConnectArgs<typeof node>) =>
						this.tryConnect(node, ...args),
				};
			}

			if (isStreamContractNode(node)) {
				return {
					$contract: node,
					stream: (...args: FetchArgs<typeof node>) =>
						this.stream(node, ...args),
					tryStream: (...args: FetchArgs<typeof node>) =>
						this.tryStream(node, ...args),
					subscribe: (...args: Parameters<SubscribeFn<typeof node>>) =>
						this.subscribe(node, ...args),
					trySubscribe: (...args: Parameters<SubscribeFn<typeof node>>) =>
						this.trySubscribe(node, ...args),
				};
			}

			return {
				$contract: node,
				fetch: (...args: FetchArgs<typeof node>) => this.fetch(node, ...args),
				tryFetch: (...args: FetchArgs<typeof node>) =>
					this.tryFetch(node, ...args),
			};
		}) as ApiClientTree<TTree>;
}
