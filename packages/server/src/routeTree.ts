import type {
	HttpRouteDeclaration,
	RouteDeclaration,
} from "@contract-first-api/core/contract";
import { compareRouteSpecificity } from "./match.ts";
import type { ImplementationTree, RouteImplementation } from "./router.ts";
import { isRouteImplementation } from "./router.ts";

export const flattenImplementationTree = (
	implementation: ImplementationTree,
): RouteImplementation<HttpRouteDeclaration>[] => {
	if (isRouteImplementation(implementation)) {
		return [implementation];
	}

	return Object.values(implementation).flatMap(flattenImplementationTree);
};

export const sortImplementations = <
	TImplementation extends { route: RouteDeclaration },
>(
	implementations: TImplementation[],
) =>
	implementations.sort((left, right) =>
		compareRouteSpecificity(left.route, right.route),
	);
