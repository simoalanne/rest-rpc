import type {
	Contract,
	ContractError,
	ContractRequest,
	ContractResponse,
	ContractTree,
	IsStreamContract,
} from "@contract-first-api/core";
import { mapContractTree, mapObjectValues } from "@contract-first-api/core";

export type FetchOptions = Omit<RequestInit, "method" | "body" | "headers">;

export type ApiClientUnknownError = {
	code: "unknown";
	status?: number;
	message?: string;
};

export type ApiClientError<E extends Contract> =
	| (ContractError<E> & { status?: number })
	| ApiClientUnknownError;

export type FetchArgs<E extends Contract = Contract> =
	ContractRequest<E> extends never
		? [options?: FetchOptions]
		: [request: ContractRequest<E>, options?: FetchOptions];

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

export type ApiResult<E extends Contract> =
	| { success: true; data: ContractResponse<E> }
	| { success: false; error: ApiClientError<E> };

export type TryFetchFn<E extends Contract> = (
	...args: FetchArgs<E>
) => Promise<ApiResult<E>>;

export type ApiClientJsonContractValue<E extends Contract = Contract> = {
	fetch: FetchFn<E>;
	tryFetch: TryFetchFn<E>;
	ctx: E;
};

export type ApiClientStreamContractValue<E extends Contract = Contract> = {
	stream: StreamFn<E>;
	subscribe: SubscribeFn<E>;
	ctx: E;
};

export type ApiClientContractValue<E extends Contract = Contract> =
	Contract extends E
		? ApiClientJsonContractValue<E> | ApiClientStreamContractValue<E>
		: IsStreamContract<E> extends true
			? ApiClientStreamContractValue<E>
			: ApiClientJsonContractValue<E>;

export type ApiClientTree<T extends ContractTree = ContractTree> =
	T extends Contract
		? ApiClientContractValue<T>
		: {
				[K in keyof T]: T[K] extends ContractTree ? ApiClientTree<T[K]> : never;
			};

export type ApiClientOptions<TTree extends ContractTree> = {
	baseUrl: string;
	contracts: TTree;
	timeoutMs?: number;
};

type RuntimeArgs = Record<string, unknown>;

const isApiClientContractNode = (
	value: unknown,
): value is ApiClientContractValue =>
	typeof value === "object" &&
	value !== null &&
	"ctx" in value &&
	("fetch" in value || "stream" in value);

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
	private getHeaders?: GetHeadersFn;
	private timeoutMs?: number;

	setHeaders = (getHeaders: GetHeadersFn) => {
		this.getHeaders = getHeaders;
	};

	constructor(options: ApiClientOptions<TTree>) {
		this.baseUrl = options.baseUrl;
		this.contracts = options.contracts;
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
			},
		);
	}

	private constructBaseRequest(
		contract: Contract,
		args?: RuntimeArgs,
	): { url: string; body?: unknown } {
		let urlBase = `${this.baseUrl}${contract.path}`;
		if (!args) return { url: urlBase };

		const { body, query, params } = this.groupKeysToRequest(args, contract);
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

		return { url: urlBase, body };
	}

	private extractArgs(contract: Contract, args: unknown[]) {
		const requestArgs = contract.request && args[0];
		const options = requestArgs ? args[1] : args[0];
		return { requestArgs, options } as {
			requestArgs?: unknown;
			options?: FetchOptions;
		};
	}

	private extractSubscribeArgs(contract: Contract, args: unknown[]) {
		const requestArgs = contract.request && args[0];
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
				...options,
				method: contract.method,
				body: body ? JSON.stringify(body) : undefined,
				headers: {
					...headers,
					...(body ? { "Content-Type": "application/json" } : {}),
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

	private async fetch<E extends Contract>(
		contract: E,
		...args: FetchArgs<E>
	): Promise<ContractResponse<E>> {
		const { rawResponse, cleanup } = await this.request(contract, ...args);

		try {
			if (!contract.response) return undefined as ContractResponse<E>;
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

	private async stream<E extends Contract>(
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

		return this.parseNdjsonStream(
			contract,
			rawResponse.body,
			cleanup,
		) as unknown as ContractResponse<E>;
	}

	private async *parseNdjsonStream(
		contract: Contract,
		body: ReadableStream<Uint8Array>,
		cleanup: () => void,
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
			cleanup();
			reader.releaseLock();
		}
	}

	private parseStreamLine(contract: Contract, line: string) {
		try {
			return contract.response?.parse(JSON.parse(line));
		} catch {
			throw {
				code: "unknown",
				message: "Backend returned a stream chunk in an unexpected format",
			};
		}
	}

	private subscribe<E extends Contract>(
		contract: E,
		...args: Parameters<SubscribeFn<E>>
	) {
		const { requestArgs, callbacks } = this.extractSubscribeArgs(contract, args);
		const controller = new AbortController();

		const streamArgs = (
			contract.request
				? [requestArgs, { signal: controller.signal }]
				: [{ signal: controller.signal }]
		) as unknown as FetchArgs<E>;

		void this.consumeStream(contract, callbacks, controller.signal, streamArgs);

		return () => controller.abort();
	}

	private async consumeStream<E extends Contract>(
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

	private async tryFetch<E extends Contract>(
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

	private buildApiClient = () =>
		mapContractTree(this.contracts, (node) => {
			if (node.options?.mode === "stream") {
				return {
					ctx: node,
					stream: (...args: FetchArgs<typeof node>) =>
						this.stream(node, ...args),
					subscribe: (...args: Parameters<SubscribeFn<typeof node>>) =>
						this.subscribe(node, ...args),
				};
			}

			return {
				ctx: node,
				fetch: (...args: FetchArgs<typeof node>) => this.fetch(node, ...args),
				tryFetch: (...args: FetchArgs<typeof node>) =>
					this.tryFetch(node, ...args),
			};
		}) as ApiClientTree<TTree>;
}
