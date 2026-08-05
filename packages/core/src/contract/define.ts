import { normalizeContract } from "./normalize.ts";
import type { ResolveRequestSchemaKeys } from "./requestKeys.ts";
import type {
	Contract,
	RouteDeclaration,
	RouteMetadata,
	ValidateResponseStatuses,
} from "./route.ts";
import { validateContractAsync, validateContractSync } from "./validate.ts";

export type CommonContractOptions = {
	pathPrefix?: string;
	metadata?: RouteMetadata;
	resolveRequestKeys?: ResolveRequestSchemaKeys;
	validate?: boolean;
};

export const route = <const TRoute extends RouteDeclaration>(
	route: TRoute & ValidateResponseStatuses<TRoute>,
	commonOptions?: CommonContractOptions,
): TRoute => {
	normalizeContract(route, commonOptions);
	if (commonOptions?.validate !== false) {
		validateContractSync(route, commonOptions);
	}
	return route as TRoute;
};

export const routeAsync = async <const TRoute extends RouteDeclaration>(
	route: TRoute & ValidateResponseStatuses<TRoute>,
	commonOptions?: CommonContractOptions,
): Promise<TRoute> => {
	normalizeContract(route, commonOptions);
	if (commonOptions?.validate !== false) {
		await validateContractAsync(route, commonOptions);
	}
	return route as TRoute;
};

export const router = <const TContract extends Contract>(
	contract: TContract & ValidateResponseStatuses<TContract>,
	commonOptions?: CommonContractOptions,
): TContract => {
	normalizeContract(contract, commonOptions);
	if (commonOptions?.validate !== false) {
		validateContractSync(contract, commonOptions);
	}
	return contract as TContract;
};

export const routerAsync = async <const TContract extends Contract>(
	contract: TContract & ValidateResponseStatuses<TContract>,
	commonOptions?: CommonContractOptions,
): Promise<TContract> => {
	normalizeContract(contract, commonOptions);
	if (commonOptions?.validate !== false) {
		await validateContractAsync(contract, commonOptions);
	}
	return contract as TContract;
};
