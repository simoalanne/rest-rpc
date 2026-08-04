import type {
	Contract,
	RouteDeclaration,
	WebSocketRouteDeclaration,
} from "../contract/route.ts";
import { buildApiClient } from "./build.ts";
import { executeRequest } from "./request.ts";
import {
	fetchResponse as fetchRouteResponse,
	fetchSuccess,
} from "./response.ts";
import type {
	ApiClientFor,
	ApiClientOptions,
	ConnectArgs,
	FetchArgs,
	InferRouteClientResponse,
} from "./types.ts";
import {
	connect as connectRoute,
	tryConnect as tryConnectRoute,
} from "./websocket.ts";

export class ApiClient<TContract extends Contract = Contract> {
	readonly api: ApiClientFor<TContract>;

	private baseUrl: string;
	private contract: TContract;
	private fetchOptions?: ApiClientOptions["fetchOptions"];
	private getHeaders?: ApiClientOptions["getHeaders"];
	private timeoutMs?: number;
	private unknownRequestKeys: "throw" | "strip";

	constructor(contract: TContract, options: ApiClientOptions) {
		this.baseUrl = options.baseUrl;
		this.contract = contract;
		this.fetchOptions = options.fetchOptions;
		this.getHeaders = options.getHeaders;
		this.timeoutMs = options.timeoutMs;
		this.unknownRequestKeys = options.unknownRequestKeys ?? "throw";

		this.api = buildApiClient(this.contract, {
			fetchResponse: (route, ...args) => this.fetchResponse(route, ...args),
			fetch: (route, ...args) => this.fetch(route, ...args),
			connect: (route, ...args) => this.connect(route, ...args),
			tryConnect: (route, ...args) => this.tryConnect(route, ...args),
		});
	}

	private request = <E extends RouteDeclaration>(
		route: E,
		...args: FetchArgs<E>
	) =>
		executeRequest(route, args, {
			baseUrl: this.baseUrl,
			fetchOptions: this.fetchOptions,
			getHeaders: this.getHeaders,
			timeoutMs: this.timeoutMs,
			unknownRequestKeys: this.unknownRequestKeys,
		});

	private fetchResponse = <E extends RouteDeclaration>(
		route: E,
		...args: FetchArgs<E>
	): Promise<InferRouteClientResponse<E>> =>
		fetchRouteResponse(this.request, route, ...args);

	private fetch = <E extends RouteDeclaration>(
		route: E,
		...args: FetchArgs<E>
	) => fetchSuccess(this.fetchResponse, route, ...args);

	private connect = <E extends WebSocketRouteDeclaration>(
		route: E,
		...args: ConnectArgs<E>
	) =>
		connectRoute(
			route,
			{
				baseUrl: this.baseUrl,
				unknownRequestKeys: this.unknownRequestKeys,
			},
			...args,
		);

	private tryConnect = <E extends WebSocketRouteDeclaration>(
		route: E,
		...args: ConnectArgs<E>
	) =>
		tryConnectRoute(
			route,
			{
				baseUrl: this.baseUrl,
				unknownRequestKeys: this.unknownRequestKeys,
			},
			...args,
		);
}

export const initClient = <TContract extends Contract>(
	contract: TContract,
	options: ApiClientOptions,
): ApiClientFor<TContract> => new ApiClient(contract, options).api;
