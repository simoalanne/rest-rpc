import type { AnyContractTree, ContractMetaOf } from "@contract-first-api/core";
import {
	type CreateExpressRouterOptions,
	createExpressRouter,
} from "./createExpressRouter.ts";
import { initServices, type ServiceTools } from "./types.ts";

type EmptyObject = Record<never, never>;

export type ServerTools<
	TContracts extends AnyContractTree,
	TContext = EmptyObject,
	TMeta = ContractMetaOf<TContracts>,
> = ServiceTools<TContracts, TContext, TMeta> & {
	createRouter: (
		options: CreateExpressRouterOptions<TContracts, TContext, TMeta>,
	) => ReturnType<typeof createExpressRouter<TContracts, TContext, TMeta>>;
};

export const initServer = <
	TContracts extends AnyContractTree,
	TContext = EmptyObject,
	TMeta = ContractMetaOf<TContracts>,
>(): ServerTools<TContracts, TContext, TMeta> => ({
	...initServices<TContracts, TContext, TMeta>(),
	createRouter: (options) =>
		createExpressRouter<TContracts, TContext, TMeta>(options),
});
