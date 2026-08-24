import type { StandardSchemaV1 } from "../standard-schema/index.ts";
import { normalizeContract } from "./normalize.ts";
import type {
	JsonQuery,
	RequestBodySchema,
	RequestKeys,
	RequestSchemaRecord,
} from "./request.ts";
import type { ResolveRequestSchemaKeys } from "./requestKeys.ts";
import type {
	DefaultBodyResponseStatusForMethod,
	DefaultNoBodyResponseStatusForMethod,
	NoBody,
	ResponseBodySchema,
	ResponseDeclaration,
	RouteResponseInput,
	RouteResponses,
} from "./response.ts";
import { validateContractSync } from "./validate.ts";
import type { WebSocketMessageDeclaration } from "./websocketMessages.ts";

export type HttpMethod = "GET" | "POST" | "PUT" | "DELETE" | "PATCH";

export type RouteMetadata = Record<string, unknown>;

/**
 * Declares one OpenAPI response header entry.
 *
 * @see {@link https://rest-rpc.dev/docs/openapi#route-metadata}
 */
export type OpenApiResponseHeader =
	| StandardSchemaV1
	| {
			description?: string;
			schema: StandardSchemaV1;
	  };

/**
 * Adds OpenAPI-only metadata for one route response status.
 *
 * @remarks This does not affect rest-rpc validation, server return types, or client response types.
 * @see {@link https://rest-rpc.dev/docs/openapi#route-metadata}
 */
export type OpenApiResponseOptions = {
	description?: string;
	headers?: Record<string, OpenApiResponseHeader>;
};
export type OpenApiRouteOptions = {
	summary?: string;
	description?: string;
	operationId?: string;
	tags?: string[];
	deprecated?: boolean;
	security?: Array<Record<string, string[]>>;
	externalDocs?: { url: string; description?: string };
	responses?: Record<number, OpenApiResponseOptions>;
	extensions?: Record<`x-${string}`, unknown>;
};
export type CommonOpenApiRouteOptions = Omit<
	OpenApiRouteOptions,
	"summary" | "description" | "operationId"
>;

/**
 * Selects whether a route is handled as HTTP or WebSocket.
 *
 * @see {@link https://rest-rpc.dev/docs/websockets}
 */
export type RouteMode = "http" | "webSocket";

export type ContractOptions = {
	mode?: RouteMode;
};

export type BaseRouteDeclaration = {
	path: string;
	method: HttpMethod;
	mode?: RouteMode;
	flattenRequestKeys?: boolean;
	cacheKey?: readonly string[];
	body?: RequestBodySchema;
	query?: StandardSchemaV1 | RequestSchemaRecord | JsonQuery;
	pathParams?: StandardSchemaV1 | RequestSchemaRecord;
	headers?: RequestSchemaRecord;
	requestKeys?: RequestKeys;
	metadata?: RouteMetadata;
	openApi?: OpenApiRouteOptions;
};

/**
 * A normalized HTTP route declaration.
 *
 * @see {@link https://rest-rpc.dev/docs/contract/declaration#route-fields}
 */
export type HttpRouteDeclaration = BaseRouteDeclaration &
	RouteResponseInput & {
		mode?: "http";
		messages?: never;
	};

/**
 * A normalized WebSocket route declaration.
 *
 * @see {@link https://rest-rpc.dev/docs/websockets#contract}
 */
export type WebSocketRouteDeclaration = BaseRouteDeclaration & {
	method: "GET";
	mode: "webSocket";
	messages: {
		client: WebSocketMessageDeclaration;
		server: WebSocketMessageDeclaration;
	};
	responses?: never;
};

/**
 * Any normalized route declaration in a contract tree.
 *
 * @see {@link https://rest-rpc.dev/docs/contract/declaration#route-fields}
 */
export type RouteDeclaration = HttpRouteDeclaration | WebSocketRouteDeclaration;

/**
 * A route declaration or nested object tree of route declarations.
 *
 * @see {@link https://rest-rpc.dev/docs/contract/declaration}
 */
export type Contract = RouteDeclaration | { [k: string]: Contract };

export const isRouteDeclaration = (value: unknown): value is RouteDeclaration =>
	typeof value === "object" &&
	value !== null &&
	"path" in value &&
	"method" in value;

export type RouteContractOptions = {
	flattenRequestKeys?: boolean;
	resolveRequestKeys?: ResolveRequestSchemaKeys;
};

export type RouterContractOptions = RouteContractOptions & {
	flattenRequestKeys?: boolean;
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

type RouteResponseDeclarationFor<TResponse> = TResponse extends {
	headers: Record<string, StandardSchemaV1>;
}
	? TResponse & ResponseDeclaration
	: TResponse & ResponseBodySchema;

type RouteResponsesFor<TRoute> = TRoute extends {
	responses: infer TResponses extends RouteResponses;
}
	? TResponses
	: TRoute extends {
				response: infer TResponse;
				method: infer TMethod extends HttpMethod;
			}
		? {
				[K in DefaultBodyResponseStatusForMethod<TMethod>]: RouteResponseDeclarationFor<TResponse>;
			}
		: TRoute extends { method: infer TMethod extends HttpMethod }
			? {
					[K in DefaultNoBodyResponseStatusForMethod<TMethod>]: NoBody;
				}
			: never;

type ApplyResponseShorthandToRoute<TRoute> = TRoute extends {
	mode: "webSocket";
}
	? TRoute
	: TRoute extends { method: HttpMethod }
		? Merge<
				Omit<TRoute, "response" | "responses"> & {
					responses: RouteResponsesFor<TRoute>;
				}
			>
		: TRoute;

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

type FlattenRequestKeys<TOptions> = TOptions extends {
	flattenRequestKeys: infer TValue extends boolean;
}
	? TValue
	: true;

type RouteFlattenRequestKeys<TRoute, TOptions> = TRoute extends {
	flattenRequestKeys: infer TValue extends boolean;
}
	? TValue
	: FlattenRequestKeys<TOptions>;

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
		ApplyInferredPathParamsToRoute<ApplyResponseShorthandToRoute<TRoute>>,
		TOptions
	> extends infer TRouteWithHeaders
		? TRouteWithHeaders extends RouteDeclaration
			? TRouteWithHeaders extends {
					responses: infer TResponses extends RouteResponses;
				}
				? Merge<
						Omit<
							TRouteWithHeaders,
							| "path"
							| "flattenRequestKeys"
							| "metadata"
							| "openApi"
							| "responses"
						> & {
							path: string;
							flattenRequestKeys: RouteFlattenRequestKeys<
								TRouteWithHeaders,
								TOptions
							>;
							metadata: RouteMetadata;
							openApi?: OpenApiRouteOptions;
							responses: MergeResponses<CommonResponses<TOptions>, TResponses>;
						}
					>
				: Merge<
						Omit<
							TRouteWithHeaders,
							"path" | "flattenRequestKeys" | "metadata" | "openApi"
						> & {
							path: string;
							flattenRequestKeys: RouteFlattenRequestKeys<
								TRouteWithHeaders,
								TOptions
							>;
							metadata: RouteMetadata;
							openApi?: OpenApiRouteOptions;
						}
					>
			: never
		: never;

type ApplyRouteOptionsToRoute<TRoute extends RouteDeclaration, TOptions> =
	ApplyInferredPathParamsToRoute<
		ApplyResponseShorthandToRoute<TRoute>
	> extends infer TRouteWithDefaults
		? TRouteWithDefaults extends RouteDeclaration
			? Merge<
					Omit<TRouteWithDefaults, "flattenRequestKeys"> & {
						flattenRequestKeys: RouteFlattenRequestKeys<
							TRouteWithDefaults,
							TOptions
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

/**
 * Defines one route and applies route-level contract normalization.
 *
 * @remarks Path params can be inferred from `:name` or `{name}` path segments when `pathParams` is omitted.
 * @see {@link https://rest-rpc.dev/docs/contract/declaration#single-routes}
 */
export function route<
	const TRoute extends RouteDeclaration,
	const TOptions extends RouteContractOptions | undefined = undefined,
>(
	route: TRoute,
	options?: TOptions,
): ApplyRouteOptionsToRoute<TRoute, TOptions> {
	normalizeContract(route, options);
	validateContractSync(route, options);
	return route as ApplyRouteOptionsToRoute<TRoute, TOptions>;
}

/**
 * Defines a contract tree and applies shared router options.
 *
 * @remarks Shared options are applied to every route in the tree before validation.
 * @see {@link https://rest-rpc.dev/docs/contract/declaration#shared-router-options}
 */
export function router<
	const TContract extends Contract,
	const TOptions extends RouterContractOptions | undefined = undefined,
>(
	contract: TContract,
	commonOptions?: TOptions,
): ApplyRouterOptions<TContract, TOptions> {
	normalizeContract(contract, commonOptions);
	validateContractSync(contract, commonOptions);
	return contract as ApplyRouterOptions<TContract, TOptions>;
}
