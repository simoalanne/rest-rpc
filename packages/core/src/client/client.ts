import type {
	Contract,
	RouteDeclaration,
	WebSocketRouteDeclaration,
} from "../contract/contract.ts";
import { buildApiClient } from "./build.ts";
import { executeRequest } from "./request.ts";
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
} from "./types.ts";
import { openConnection as openRouteConnection } from "./websocket.ts";

export class ApiClient<TContract extends Contract = Contract> {
	readonly api: ApiClientFor<TContract>;

	private baseUrl: string;
	private contract: TContract;
	private fetchImpl?: ApiClientOptions["fetch"];
	private fetchOptions?: ApiClientOptions["fetchOptions"];
	private getGlobalHeaders?: ApiClientOptions["getGlobalHeaders"];
	private nextFetchTags?: ApiClientOptions["nextFetchTags"];
	private timeoutMs?: number;
	private unknownRequestKeys: "throw" | "strip";
	private validateResponses: boolean;

	constructor(contract: TContract, options: ApiClientOptions) {
		this.baseUrl = options.baseUrl;
		this.contract = contract;
		this.fetchImpl = options.fetch;
		this.fetchOptions = options.fetchOptions;
		this.getGlobalHeaders = options.getGlobalHeaders;
		this.nextFetchTags = options.nextFetchTags;
		this.timeoutMs = options.timeoutMs;
		this.unknownRequestKeys = options.unknownRequestKeys ?? "throw";
		this.validateResponses = options.validateResponses ?? false;

		this.api = buildApiClient(this.contract, {
			fetchResponse: (route, ...args) => this.fetchResponse(route, ...args),
			fetch: (route, ...args) => this.fetch(route, ...args),
			openConnection: (route, ...args) => this.openConnection(route, ...args),
		});
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
			unknownRequestKeys: this.unknownRequestKeys,
		});

	private fetchResponse = <E extends RouteDeclaration>(
		route: E,
		...args: FetchArgs<E>
	): Promise<ClientResponse<E>> =>
		fetchRouteResponse(this.request, this.validateResponses, route, ...args);

	private fetch = <E extends RouteDeclaration>(
		route: E,
		...args: FetchArgs<E>
	) => fetchSuccess(this.fetchResponse, route, ...args);

	private openConnection = <E extends WebSocketRouteDeclaration>(
		route: E,
		...args: OpenConnectionArgs<E>
	) =>
		openRouteConnection(
			route,
			{
				baseUrl: this.baseUrl,
				unknownRequestKeys: this.unknownRequestKeys,
				validateIncomingMessages: this.validateResponses,
			},
			...args,
		);
}

/**
 * Creates a typed fetch client from a contract.
 *
 * @see {@link https://rest-rpc.dev/docs/client/fetch-client}
 */
export function initClient<TContract extends Contract>(
	contract: TContract,
	options: ApiClientOptions,
): ApiClientFor<TContract> {
	return new ApiClient(contract, options).api;
}
