import type { StandardSchemaV1 } from "../standard-schema/index.ts";
import { normalizeContract } from "./normalize.ts";
import type {
	RequestBodySchema,
	RequestKeys,
	RequestSchemaRecord,
} from "./request.ts";
import type { ResolveRequestSchemaKeys } from "./requestKeys.ts";
import type { RouteResponses } from "./response.ts";
import { validateContractSync } from "./validate.ts";

export type HttpMethod = "GET" | "POST" | "PUT" | "DELETE" | "PATCH";

export type RouteMetadata = Record<string, unknown>;
export type OpenApiRouteOptions = {
	summary?: string;
	description?: string;
	operationId?: string;
	tags?: string[];
	deprecated?: boolean;
	security?: Array<Record<string, string[]>>;
	externalDocs?: { url: string; description?: string };
	responseDescriptions?: Record<number, string>;
	extensions?: Record<`x-${string}`, unknown>;
};
export type CommonOpenApiRouteOptions = Omit<
	OpenApiRouteOptions,
	"summary" | "description" | "operationId"
>;

export type ContractOptions = {
	mode?: "http" | "websocket";
};

export type BaseRouteDeclaration = {
	path: string;
	method: HttpMethod;
	cacheKey?: readonly string[];
	body?: RequestBodySchema;
	query?: StandardSchemaV1 | RequestSchemaRecord;
	pathParams?: StandardSchemaV1 | RequestSchemaRecord;
	headers?: RequestSchemaRecord;
	requestKeys?: RequestKeys;
	metadata?: RouteMetadata;
	openApi?: OpenApiRouteOptions;
};

export type HttpRouteDeclaration = BaseRouteDeclaration & {
	responses: RouteResponses;
	options?: { mode?: "http" };
	messages?: never;
};

export type WebSocketRouteDeclaration = BaseRouteDeclaration & {
	method: "GET";
	options: { mode: "websocket" };
	messages: {
		client: StandardSchemaV1;
		server: StandardSchemaV1;
	};
	responses?: never;
};

export type RouteDeclaration = HttpRouteDeclaration | WebSocketRouteDeclaration;

export type Contract = RouteDeclaration | { [k: string]: Contract };

export const isRouteDeclaration = (value: unknown): value is RouteDeclaration =>
	typeof value === "object" &&
	value !== null &&
	"path" in value &&
	"method" in value;

export type RouteContractOptions = {
	resolveRequestKeys?: ResolveRequestSchemaKeys;
	validate?: boolean;
};

export type RouterContractOptions = RouteContractOptions & {
	pathPrefix?: string;
	metadata?: RouteMetadata;
	commonResponses?: RouteResponses;
	commonHeaders?: Record<string, StandardSchemaV1>;
	commonOpenApi?: CommonOpenApiRouteOptions;
};

type Merge<T> = {
	[K in keyof T]: T[K];
};
type EmptyObject = Record<never, never>;

type PathSegmentParamName<TSegment extends string> =
	TSegment extends `:${infer TName}`
		? TName extends ""
			? never
			: TName
		: TSegment extends `{${infer TName}}`
			? TName extends ""
				? never
				: TName
			: never;

type PathParamNames<TPath extends string> = string extends TPath
	? never
	: TPath extends `${infer TSegment}/${infer TRest}`
		? PathSegmentParamName<TSegment> | PathParamNames<TRest>
		: PathSegmentParamName<TPath>;

type InferredPathParamSchemaRecord<TPath extends string> = {
	[K in PathParamNames<TPath>]: StandardSchemaV1<string, string>;
};

type ApplyInferredPathParamsToRoute<TRoute> = "pathParams" extends keyof TRoute
	? TRoute
	: TRoute extends { path: infer TPath extends string }
		? [PathParamNames<TPath>] extends [never]
			? TRoute
			: Merge<
					Omit<TRoute, "pathParams"> & {
						pathParams: InferredPathParamSchemaRecord<TPath>;
					}
				>
		: TRoute;

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

type RouteHeadersFor<TRoute> = TRoute extends {
	headers: infer THeaders extends Record<string, StandardSchemaV1>;
}
	? THeaders
	: EmptyObject;

type MergeHeaders<TCommon, TRoute> = Merge<
	Omit<TCommon, keyof TRoute> & TRoute
>;

type ApplyCommonHeadersToRouteFields<TRoute, TOptions> =
	keyof CommonHeaders<TOptions> extends never
		? TRoute
		: Merge<
				Omit<TRoute, "headers"> & {
					headers: MergeHeaders<
						CommonHeaders<TOptions>,
						RouteHeadersFor<TRoute>
					>;
				}
			>;

type ApplyCommonHeadersToRoute<TRoute, TOptions> =
	keyof CommonHeaders<TOptions> extends never
		? TRoute
		: Merge<
				Omit<TRoute, "headers"> &
					ApplyCommonHeadersToRouteFields<TRoute, TOptions>
			>;

type ApplyRouterOptionsToRoute<TRoute extends RouteDeclaration, TOptions> =
	ApplyCommonHeadersToRoute<
		ApplyInferredPathParamsToRoute<TRoute>,
		TOptions
	> extends infer TRouteWithHeaders
		? TRouteWithHeaders extends RouteDeclaration
			? TRouteWithHeaders extends {
					responses: infer TResponses extends RouteResponses;
				}
				? Merge<
						Omit<
							TRouteWithHeaders,
							"path" | "metadata" | "openApi" | "responses"
						> & {
							path: string;
							metadata: RouteMetadata;
							openApi?: OpenApiRouteOptions;
							responses: MergeResponses<CommonResponses<TOptions>, TResponses>;
						}
					>
				: Merge<
						Omit<TRouteWithHeaders, "path" | "metadata" | "openApi"> & {
							path: string;
							metadata: RouteMetadata;
							openApi?: OpenApiRouteOptions;
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
	route: TRoute,
	options?: RouteContractOptions,
): ApplyInferredPathParamsToRoute<TRoute> => {
	normalizeContract(route);
	if (options?.validate !== false) {
		validateContractSync(route, options);
	}
	return route as ApplyInferredPathParamsToRoute<TRoute>;
};

export const router = <
	const TContract extends Contract,
	const TOptions extends RouterContractOptions | undefined = undefined,
>(
	contract: TContract,
	commonOptions?: TOptions,
): ApplyRouterOptions<TContract, TOptions> => {
	normalizeContract(contract, commonOptions);
	if (commonOptions?.validate !== false) {
		validateContractSync(contract, commonOptions);
	}
	return contract as ApplyRouterOptions<TContract, TOptions>;
};
