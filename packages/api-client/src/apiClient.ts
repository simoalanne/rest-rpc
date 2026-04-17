import type {
	Contract,
	ContractRequest,
	ContractResponse,
	ContractTree,
	ResponseSchema,
} from "@contract-first-api/core";
import { mapContractTree, mapObjectValues } from "@contract-first-api/core";

export type ContractError = {
	type: "unexpected";
	status?: number;
	message: string;
};

export type FetchOptions = {
	signal?: AbortSignal;
	cache?: RequestCache;
};

export type FetchArgs<E extends Contract = Contract> =
	ContractRequest<E> extends never
		? [options?: FetchOptions]
		: [request: ContractRequest<E>, options?: FetchOptions];

export type FetchFn<E extends Contract> = (
	...args: FetchArgs<E>
) => Promise<ContractResponse<E>>;

export type ApiClientContractValue<E extends Contract = Contract> = {
	fetch: FetchFn<E>;
	ctx: E;
};

export type ApiClientTree<T extends ContractTree = ContractTree> =
	T extends Contract
		? ApiClientContractValue<T>
		: {
				[K in keyof T]: T[K] extends ContractTree ? ApiClientTree<T[K]> : never;
			};

export class ApiClientHttpError extends Error {
	response: Response;

	constructor(response: Response, message?: string) {
		super(message ?? `HTTP ${response.status} ${response.statusText}`);
		this.name = "ApiClientHttpError";
		this.response = response;
	}
}

type ApiClientError = {
	endpoint: string;
	error: ApiClientHttpError;
};

export type ApiClientOptions<TTree extends ContractTree> = {
	baseUrl: string;
	endpoints: TTree;
	onHttpError?: (error: ApiClientError) => void;
	defaultHeaders?: Record<string, string>;
	timeoutMs?: number;
};

type RuntimeArgs = Record<string, unknown>;

const isApiClientContractNode = (
	value: unknown,
): value is ApiClientContractValue =>
	typeof value === "object" &&
	value !== null &&
	"fetch" in value &&
	"ctx" in value;

const parseJsonSafely = async (response: Response) => {
	try {
		return await response.json();
	} catch {
		return null;
	}
};

const parseResponseDefinition = <T>(
	definition: ResponseSchema | undefined,
	payload: unknown,
): { success: true; data: T | undefined } | { success: false } => {
	if (definition === undefined) {
		return { success: false };
	}

	const result = definition.safeParse(payload);
	return result.success
		? { success: true, data: result.data as T }
		: { success: false };
};

const createRequestSignal = (
	signal: AbortSignal | undefined,
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

export const mapApiClientTree = (
	tree: ApiClientTree<ContractTree>,
	mappingFn: (leaf: ApiClientContractValue, path: string[]) => unknown,
) => mapObjectValues(tree, isApiClientContractNode, mappingFn);

export class ApiClient<TTree extends ContractTree = ContractTree> {
	api: ApiClientTree<TTree>;

	private baseUrl: string;
	private endpoints: TTree;
	private onHttpError?: (error: ApiClientError) => void;
	private defaultHeaders: Record<string, string>;
	private timeoutMs?: number;

	setOnHttpError = (onHttpError: (error: ApiClientError) => void) => {
		this.onHttpError = onHttpError;
	};

	setDefaultHeaders = (defaultHeaders: Record<string, string>) => {
		this.defaultHeaders = defaultHeaders;
	};

	constructor(options: ApiClientOptions<TTree>) {
		this.baseUrl = options.baseUrl;
		this.endpoints = options.endpoints;
		this.defaultHeaders = options.defaultHeaders ?? {};
		this.onHttpError = options.onHttpError;
		this.timeoutMs = options.timeoutMs;

		this.api = this.buildApiClient();
	}

	private groupKeysToRequest(args: RuntimeArgs, contract: Contract) {
		const keyMap = new Map<string, "body" | "query" | "params">();
		(["body", "query", "params"] as const).forEach((type) => {
			const keys = Object.keys(contract.request?.[type]?.shape ?? {});
			keys.forEach((key) => {
				keyMap.set(key, type);
			});
		});

		return Object.entries(args).reduce(
			(acc, [k, v]) => {
				const bucket = keyMap.get(k);
				if (!bucket) return acc;
				if (!acc[bucket]) acc[bucket] = {};
				acc[bucket][k] = v;
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

	private async fetch<E extends Contract>(
		contract: E,
		...args: FetchArgs<E>
	): Promise<ContractResponse<E>> {
		const { requestArgs, options } = this.extractArgs(contract, args);
		const { url, body } = this.constructBaseRequest(
			contract,
			requestArgs as RuntimeArgs,
		);
		const signalState = createRequestSignal(options?.signal, this.timeoutMs);

		try {
			const rawResponse = await fetch(url, {
				method: contract.method,
				body: body ? JSON.stringify(body) : undefined,
				headers: {
					...this.defaultHeaders,
					...(body ? { "Content-Type": "application/json" } : {}),
				},
				signal: signalState?.signal ?? options?.signal,
				cache: options?.cache,
			});

			if (!rawResponse.ok) {
				const httpError = new ApiClientHttpError(rawResponse);
				this.onHttpError?.({
					endpoint: `${contract.method} ${contract.path}`,
					error: httpError,
				});

				throw {
					type: "unexpected",
					status: rawResponse.status,
					message: httpError.message,
				} as ContractError;
			}

			const response = await parseJsonSafely(rawResponse);
			const parsedResponse = parseResponseDefinition(
				contract.response,
				response,
			);
			if (!parsedResponse.success) {
				console.warn(
					`Backend returned a response that does not match the expected schema for contract ${contract.method} ${contract.path}.`,
				);
				throw {
					type: "unexpected",
					message: "Backend returned its response in an unexpected format",
				} as ContractError;
			}

			return parsedResponse.data as ContractResponse<E>;
		} finally {
			signalState?.cleanup();
		}
	}

	private buildApiClient = () =>
		mapContractTree(this.endpoints, (node) => ({
			ctx: node,
			fetch: (...args: FetchArgs<typeof node>) => this.fetch(node, ...args),
		})) as ApiClientTree<TTree>;
}
