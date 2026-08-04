import type {
	Contract,
	InferRouteSuccessBody,
	RouteDeclaration,
	WebSocketRouteDeclaration,
} from "../contract/route.ts";
import { mapContractRoutes } from "../contract/traversal.ts";
import { hasSingleSuccessfulResponse, isWebSocketRouteNode } from "./routes.ts";
import type {
	ApiClientFor,
	ConnectArgs,
	FetchArgs,
	InferRouteClientResponse,
	InferRouteClientSocket,
} from "./types.ts";

export type ApiClientRouteHandlers = {
	fetchResponse: <E extends RouteDeclaration>(
		route: E,
		...args: FetchArgs<E>
	) => Promise<InferRouteClientResponse<E>>;
	fetch: <E extends RouteDeclaration>(
		route: E,
		...args: FetchArgs<E>
	) => Promise<InferRouteSuccessBody<E>>;
	connect: <E extends WebSocketRouteDeclaration>(
		route: E,
		...args: ConnectArgs<E>
	) => InferRouteClientSocket<E>;
	tryConnect: <E extends WebSocketRouteDeclaration>(
		route: E,
		...args: ConnectArgs<E>
	) =>
		| { success: true; data: InferRouteClientSocket<E> }
		| { success: false; error: unknown };
};

export const buildApiClient = <TContract extends Contract>(
	contract: TContract,
	handlers: ApiClientRouteHandlers,
): ApiClientFor<TContract> =>
	mapContractRoutes(contract, (node) => {
		if (isWebSocketRouteNode(node)) {
			return {
				connect: (...args: ConnectArgs<typeof node>) =>
					handlers.connect(node, ...args),
				tryConnect: (...args: ConnectArgs<typeof node>) =>
					handlers.tryConnect(node, ...args),
			};
		}

		const fetchResponse = (...args: FetchArgs<typeof node>) =>
			handlers.fetchResponse(node, ...args);

		if (!hasSingleSuccessfulResponse(node)) {
			return {
				fetchResponse,
			};
		}

		return {
			fetch: (...args: FetchArgs<typeof node>) => handlers.fetch(node, ...args),
			fetchResponse,
		};
	}) as ApiClientFor<TContract>;
