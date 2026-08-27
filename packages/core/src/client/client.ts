import type { Contract, RouteDeclaration } from "../contract/contract.ts";
import { buildApiClient } from "./build.ts";
import {
	constructBaseRequest,
	executeRequest,
	takesRequestInput,
} from "./request.ts";
import {
	fetchResponse as fetchRouteResponse,
	fetchSuccess,
} from "./response.ts";
import type {
	ApiClientFor,
	ApiClientOptions,
	ClientResponse,
	FetchArgs,
	OpenConnectionArgs,
	OpenConnectionFn,
} from "./types.ts";
import { openSseConnection } from "./sse.ts";
import { openConnection as openRouteConnection } from "./websocket.ts";

export class ApiClient<
	TContract extends Contract = Contract,
	TStrictStatusCodes extends boolean = false,
	TGlobalHeaders extends Record<string, string> = Record<never, string>,
> {
	readonly api: ApiClientFor<TContract, TStrictStatusCodes, TGlobalHeaders>;

	private baseUrl: string;
	private contract: TContract;
	private fetchImpl?: ApiClientOptions["fetch"];
	private fetchOptions?: ApiClientOptions["fetchOptions"];
	private getGlobalHeaders?: ApiClientOptions["getGlobalHeaders"];
	private nextFetchTags?: ApiClientOptions["nextFetchTags"];
	private strictStatusCodes: boolean;
	private timeoutMs?: number;
	private strictRequestKeys: boolean;
	private validateResponses: boolean;

	constructor(
		contract: TContract,
		options: ApiClientOptions<boolean, TGlobalHeaders>,
	) {
		this.baseUrl = options.baseUrl;
		this.contract = contract;
		this.fetchImpl = options.fetch;
		this.fetchOptions = options.fetchOptions;
		this.getGlobalHeaders = options.getGlobalHeaders;
		this.nextFetchTags = options.nextFetchTags;
		this.strictStatusCodes = options.strictStatusCodes ?? false;
		this.timeoutMs = options.timeoutMs;
		this.strictRequestKeys = options.strictRequestKeys ?? true;
		this.validateResponses = options.validateResponses ?? false;

		this.api = buildApiClient(this.contract, {
			fetchResponse: (route, ...args) => this.fetchResponse(route, ...args),
			fetch: (route, ...args) => this.fetch(route, ...args),
			openConnection: (route, ...args) => this.openConnection(route, ...args),
		}) as unknown as ApiClientFor<
			TContract,
			TStrictStatusCodes,
			TGlobalHeaders
		>;
	}

	private request = <E extends RouteDeclaration>(
		route: E,
		...args: FetchArgs<E>
	) =>
		executeRequest(route, args, {
			baseUrl: this.baseUrl,
			fetch: this.fetchImpl,
			fetchOptions: this.fetchOptions,
			getGlobalHeaders: this.getGlobalHeaders,
			nextFetchTags: this.nextFetchTags,
			timeoutMs: this.timeoutMs,
			strictRequestKeys: this.strictRequestKeys,
		});

	private fetchResponse = <E extends RouteDeclaration>(
		route: E,
		...args: FetchArgs<E>
	): Promise<ClientResponse<E>> =>
		fetchRouteResponse(
			this.request,
			this.validateResponses,
			this.strictStatusCodes,
			route,
			...args,
		);

	private fetch = <E extends RouteDeclaration>(
		route: E,
		...args: FetchArgs<E>
	) => fetchSuccess(this.fetchResponse, route, ...args);

	private openConnection = <E extends RouteDeclaration>(
		route: E,
		...args: OpenConnectionArgs<E>
	): ReturnType<OpenConnectionFn<E>> => {
		const requestArgs = takesRequestInput(route) ? args[0] : undefined;
		const { url } = constructBaseRequest(
			this.baseUrl,
			route,
			requestArgs,
			this.strictRequestKeys,
		);
		const options = {
			validateIncomingMessages: this.validateResponses,
		};

		if (route.mode === "sse") {
			return openSseConnection(route, options, url) as ReturnType<
				OpenConnectionFn<E>
			>;
		}

		return openRouteConnection(
			route as Extract<E, { mode: "webSocket" }>,
			{
				validateIncomingMessages: this.validateResponses,
			},
			url,
		) as ReturnType<OpenConnectionFn<E>>;
	};
}

/**
 * Creates a typed fetch client from a contract.
 *
 * @see {@link https://rest-rpc.dev/docs/client/fetch-client}
 */
export function initClient<
	TContract extends Contract,
	const TStrictStatusCodes extends boolean = false,
	const TGlobalHeaders extends Record<string, string> = Record<never, string>,
>(
	contract: TContract,
	options: ApiClientOptions<TStrictStatusCodes, TGlobalHeaders>,
): ApiClientFor<TContract, TStrictStatusCodes, TGlobalHeaders> {
	return new ApiClient<TContract, TStrictStatusCodes, TGlobalHeaders>(
		contract,
		options,
	).api;
}
