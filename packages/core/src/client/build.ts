import type {
	ClientSuccessBody,
	Contract,
	RouteDeclaration,
	WebSocketRouteDeclaration,
} from "../contract/route.ts";
import { mapContractRoutes } from "../contract/traversal.ts";
import { hasSingleSuccessfulResponse, isWebSocketRouteNode } from "./routes.ts";
import type {
	ApiClientFor,
	ClientFetchResponse,
	ClientSocket,
	FetchArgs,
	OpenConnectionArgs,
} from "./types.ts";

export type ApiClientRouteHandlers = {
	fetchResponse: <E extends RouteDeclaration>(
		route: E,
		...args: FetchArgs<E>
	) => Promise<ClientFetchResponse<E>>;
	fetch: <E extends RouteDeclaration>(
		route: E,
		...args: FetchArgs<E>
	) => Promise<ClientSuccessBody<E>>;
	openConnection: <E extends WebSocketRouteDeclaration>(
		route: E,
		...args: OpenConnectionArgs<E>
	) => ClientSocket<E>;
};

export const buildApiClient = <TContract extends Contract>(
	contract: TContract,
	handlers: ApiClientRouteHandlers,
): ApiClientFor<TContract> =>
	mapContractRoutes(contract, (node) => {
		if (isWebSocketRouteNode(node)) {
			return {
				openConnection: (...args: OpenConnectionArgs<typeof node>) =>
					handlers.openConnection(node, ...args),
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
