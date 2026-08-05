import type { StandardSchemaV1 } from "../standard-schema/index.ts";
import { normalizeContract } from "./normalize.ts";
import type { ResolveRequestSchemaKeys } from "./requestKeys.ts";
import type {
	Contract,
	RequestSchema,
	RouteDeclaration,
	RouteMetadata,
	RouteResponses,
	ValidateResponseStatuses,
} from "./route.ts";
import { validateContractAsync, validateContractSync } from "./validate.ts";

export type RouteContractOptions = {
	resolveRequestKeys?: ResolveRequestSchemaKeys;
	validate?: boolean;
};

export type RouterContractOptions = RouteContractOptions & {
	pathPrefix?: string;
	metadata?: RouteMetadata;
	commonResponses?: RouteResponses;
	commonHeaders?: Record<string, StandardSchemaV1>;
};

type Merge<T> = {
	[K in keyof T]: T[K];
};
type EmptyObject = Record<never, never>;

type TrimTrailingSlashes<T extends string> = T extends `${infer TRest}/`
	? TrimTrailingSlashes<TRest>
	: T;

type TrimLeadingSlashes<T extends string> = T extends `/${infer TRest}`
	? TrimLeadingSlashes<TRest>
	: T;

type JoinPathPrefix<
	TPrefix extends string,
	TPath extends string,
> = string extends TPrefix | TPath
	? string
	: TrimTrailingSlashes<TPrefix> extends infer TNormalizedPrefix extends string
		? TrimLeadingSlashes<TPath> extends infer TNormalizedPath extends string
			? TNormalizedPrefix extends ""
				? TNormalizedPath extends ""
					? "/"
					: `/${TNormalizedPath}`
				: TNormalizedPath extends ""
					? TNormalizedPrefix
					: `${TNormalizedPrefix}/${TNormalizedPath}`
			: never
		: never;

type ApplyPathPrefix<TPath, TOptions> = TPath extends string
	? TOptions extends { pathPrefix: infer TPrefix extends string }
		? TPrefix extends ""
			? TPath
			: JoinPathPrefix<TPrefix, TPath>
		: TPath
	: TPath;

type CommonMetadata<TOptions> = TOptions extends {
	metadata: infer TMetadata extends RouteMetadata;
}
	? TMetadata
	: EmptyObject;

type RouteMetadataFor<TRoute> = TRoute extends {
	metadata: infer TMetadata extends RouteMetadata;
}
	? TMetadata
	: EmptyObject;

type MergeMetadata<TCommon, TRoute> = Merge<
	Omit<TCommon, keyof TRoute> & TRoute
>;

type CommonResponses<TOptions> = TOptions extends {
	commonResponses: infer TResponses extends RouteResponses;
}
	? TResponses
	: EmptyObject;

type MergeResponses<TCommon, TRoute> = Merge<
	Omit<TCommon, keyof TRoute> & TRoute
>;

type CommonHeaders<TOptions> = TOptions extends {
	commonHeaders: infer THeaders extends Record<string, StandardSchemaV1>;
}
	? THeaders
	: EmptyObject;

type RouteHeadersFor<TRequest> = TRequest extends {
	headers: infer THeaders extends Record<string, StandardSchemaV1>;
}
	? THeaders
	: EmptyObject;

type MergeHeaders<TCommon, TRoute> = Merge<
	Omit<TCommon, keyof TRoute> & TRoute
>;

type ApplyCommonHeadersToRequest<TRequest, TOptions> =
	keyof CommonHeaders<TOptions> extends never
		? TRequest
		: Merge<
				(TRequest extends RequestSchema
					? Omit<TRequest, "headers">
					: EmptyObject) & {
					headers: MergeHeaders<
						CommonHeaders<TOptions>,
						RouteHeadersFor<TRequest>
					>;
				}
			>;

type ApplyCommonHeadersToRoute<TRoute, TOptions> =
	keyof CommonHeaders<TOptions> extends never
		? TRoute
		: Merge<
				Omit<TRoute, "request"> & {
					request: ApplyCommonHeadersToRequest<
						TRoute extends { request: infer TRequest } ? TRequest : EmptyObject,
						TOptions
					>;
				}
			>;

type ApplyRouterOptionsToRoute<TRoute extends RouteDeclaration, TOptions> =
	ApplyCommonHeadersToRoute<TRoute, TOptions> extends infer TRouteWithHeaders
		? TRouteWithHeaders extends RouteDeclaration
			? TRouteWithHeaders extends {
					responses: infer TResponses extends RouteResponses;
				}
				? Merge<
						Omit<TRouteWithHeaders, "path" | "metadata" | "responses"> & {
							path: ApplyPathPrefix<TRoute["path"], TOptions>;
							metadata: MergeMetadata<
								CommonMetadata<TOptions>,
								RouteMetadataFor<TRoute>
							>;
							responses: MergeResponses<CommonResponses<TOptions>, TResponses>;
						}
					>
				: Merge<
						Omit<TRouteWithHeaders, "path" | "metadata"> & {
							path: ApplyPathPrefix<TRoute["path"], TOptions>;
							metadata: MergeMetadata<
								CommonMetadata<TOptions>,
								RouteMetadataFor<TRoute>
							>;
						}
					>
			: never
		: never;

export type ApplyRouterOptions<
	TContract extends Contract,
	TOptions,
> = TContract extends RouteDeclaration
	? ApplyRouterOptionsToRoute<TContract, TOptions>
	: {
			[K in keyof TContract]: TContract[K] extends Contract
				? ApplyRouterOptions<TContract[K], TOptions>
				: never;
		};

export const route = <const TRoute extends RouteDeclaration>(
	route: TRoute & ValidateResponseStatuses<TRoute>,
	options?: RouteContractOptions,
): TRoute => {
	normalizeContract(route);
	if (options?.validate !== false) {
		validateContractSync(route, options);
	}
	return route as TRoute;
};

export const routeAsync = async <const TRoute extends RouteDeclaration>(
	route: TRoute & ValidateResponseStatuses<TRoute>,
	options?: RouteContractOptions,
): Promise<TRoute> => {
	normalizeContract(route);
	if (options?.validate !== false) {
		await validateContractAsync(route, options);
	}
	return route as TRoute;
};

export const router = <
	const TContract extends Contract,
	const TOptions extends RouterContractOptions | undefined = undefined,
>(
	contract: TContract &
		ValidateResponseStatuses<ApplyRouterOptions<TContract, TOptions>>,
	commonOptions?: TOptions,
): ApplyRouterOptions<TContract, TOptions> => {
	normalizeContract(contract, commonOptions);
	if (commonOptions?.validate !== false) {
		validateContractSync(contract, commonOptions);
	}
	return contract as ApplyRouterOptions<TContract, TOptions>;
};

export const routerAsync = async <
	const TContract extends Contract,
	const TOptions extends RouterContractOptions | undefined = undefined,
>(
	contract: TContract &
		ValidateResponseStatuses<ApplyRouterOptions<TContract, TOptions>>,
	commonOptions?: TOptions,
): Promise<ApplyRouterOptions<TContract, TOptions>> => {
	normalizeContract(contract, commonOptions);
	if (commonOptions?.validate !== false) {
		await validateContractAsync(contract, commonOptions);
	}
	return contract as ApplyRouterOptions<TContract, TOptions>;
};
