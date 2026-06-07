import type {
	Contract,
	ContractError,
	ContractMetaOf,
	ContractTree,
} from "@contract-first-api/core";
import {
	type CreateExpressRouterOptions,
	createExpressRouter,
} from "./createExpressRouter.ts";
import { KnownContractError } from "./KnownContractError.ts";
import { initServices, type ServiceTools } from "./types.ts";

type EmptyObject = Record<never, never>;

type AllKnownErrors<T extends ContractTree> = T extends Contract
	? ContractError<T>
	: {
			[K in keyof T]: T[K] extends ContractTree ? AllKnownErrors<T[K]> : never;
		}[keyof T];

export type ServerTools<
	TContracts extends ContractTree,
	TContext = EmptyObject,
	TMeta = ContractMetaOf<TContracts>,
> = ServiceTools<TContracts, TContext, TMeta> & {
	createRouter: (
		options: CreateExpressRouterOptions<TContracts, TContext, TMeta>,
	) => ReturnType<typeof createExpressRouter<TContracts, TContext, TMeta>>;
	throwKnownError: (error: AllKnownErrors<TContracts>) => never;
};

export const initServer = <
	TContracts extends ContractTree,
	TContext = EmptyObject,
	TMeta = ContractMetaOf<TContracts>,
>(): ServerTools<TContracts, TContext, TMeta> => ({
	...initServices<TContracts, TContext, TMeta>(),
	createRouter: (options) =>
		createExpressRouter<TContracts, TContext, TMeta>(options),
	throwKnownError: (error) => {
		throw new KnownContractError(error);
	},
});
