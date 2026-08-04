import { normalizeContract } from "./normalize.ts";
import type { ResolveRequestSchemaKeys } from "./requestKeys.ts";
import type {
	Contract,
	RouteMetadata,
	ValidateResponseStatuses,
} from "./route.ts";
import { validateContractAsync, validateContractSync } from "./validate.ts";

export type CommonContractOptions = {
	pathPrefix?: string;
	prefix?: string;
	metadata?: RouteMetadata;
	resolveRequestKeys?: ResolveRequestSchemaKeys;
	validate?: boolean;
};

export const defineContract = <const TContract extends Contract>(
	contract: TContract & ValidateResponseStatuses<TContract>,
	commonOptions?: CommonContractOptions,
): TContract => {
	normalizeContract(contract, commonOptions);
	if (commonOptions?.validate !== false) {
		validateContractSync(contract, commonOptions);
	}
	return contract as TContract;
};

export const defineContractAsync = async <const TContract extends Contract>(
	contract: TContract & ValidateResponseStatuses<TContract>,
	commonOptions?: CommonContractOptions,
): Promise<TContract> => {
	normalizeContract(contract, commonOptions);
	if (commonOptions?.validate !== false) {
		await validateContractAsync(contract, commonOptions);
	}
	return contract as TContract;
};
