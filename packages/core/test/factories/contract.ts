import { noBody } from "../../src/contract/body.ts";
import type {
	HttpRouteDeclaration,
	RouteMetadata,
} from "../../src/contract/contract.ts";

type RouteOverrides = Partial<HttpRouteDeclaration> & {
	metadata?: RouteMetadata;
};

export const testRoute = (
	overrides: RouteOverrides = {},
): HttpRouteDeclaration => ({
	method: "GET",
	path: "/search",
	responses: {
		204: noBody(),
	},
	...overrides,
});

export const testContract = (
	routeOverrides: RouteOverrides = {},
): {
	search: {
		find: HttpRouteDeclaration;
	};
} => ({
	search: {
		find: testRoute(routeOverrides),
	},
});
