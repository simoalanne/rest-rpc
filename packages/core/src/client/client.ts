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
	ClientFetchResponse,
	FetchArgs,
	OpenConnectionArgs,
} from "./types.ts";
import { openConnection as openRouteConnection } from "./websocket.ts";

export const normalizeOrigin = (origin: string) => {
	let url: URL;
	try {
		url = new URL(origin);
	} catch {
		throw new Error(
			"ApiClient origin must be an absolute URL origin without a path, search, or hash. Put API path prefixes in route.path instead.",
		);
	}

	if (url.pathname !== "/" || url.search || url.hash) {
		throw new Error(
			"ApiClient origin must be an absolute URL origin without a path, search, or hash. Put API path prefixes in route.path instead.",
		);
	}

	return url.origin;
};

export class ApiClient<TContract extends Contract = Contract> {
	readonly api: ApiClientFor<TContract>;

	private origin: string;
	private contract: TContract;
	private fetchImpl?: ApiClientOptions["fetch"];
	private fetchOptions?: ApiClientOptions["fetchOptions"];
	private getGlobalHeaders?: ApiClientOptions["getGlobalHeaders"];
	private nextFetchTags?: ApiClientOptions["nextFetchTags"];
	private timeoutMs?: number;
	private unknownRequestKeys: "throw" | "strip";
	private validateResponses: boolean;

	constructor(contract: TContract, options: ApiClientOptions) {
		this.origin = normalizeOrigin(options.origin);
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
			origin: this.origin,
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
	): Promise<ClientFetchResponse<E>> =>
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
				origin: this.origin,
				unknownRequestKeys: this.unknownRequestKeys,
				validateIncomingMessages: this.validateResponses,
			},
			...args,
		);
}

export const initClient = <TContract extends Contract>(
	contract: TContract,
	options: ApiClientOptions,
): ApiClientFor<TContract> => new ApiClient(contract, options).api;
