import type { StandardSchemaV1 } from "../standard-schema/index.ts";
import type { BodyOptions } from "./body.ts";
import type {
	AbsolutePath,
	HttpMethod,
	OpenApiRouteOptions,
	RouteMetadata,
	RouteRequestDeclaration,
} from "./routeDeclaration.ts";
import type {
	RequestHeadersSchema,
	RequestParamsSchema,
	RequestQuerySchema,
} from "./request.ts";
import type { ResponseOptions, StreamResponseOptions } from "./response.ts";
import type { EmptyObject, Merge } from "../typeUtils.ts";

type JsonContentType = "application/json";
type BuilderPath = AbsolutePath | undefined;

type ContentTypeFor<TOptions> = TOptions extends BodyOptions
	? TOptions["contentType"]
	: JsonContentType;

type ResponseHeadersFor<TOptions> = TOptions extends {
	headers: infer THeaders;
}
	? { headers: THeaders }
	: EmptyObject;

type ResponseFor<TSchema, TOptions> = TSchema extends StandardSchemaV1
	? {
			body: TSchema;
			contentType: ContentTypeFor<TOptions>;
		} & ResponseHeadersFor<TOptions>
	: { body: undefined } & ResponseHeadersFor<TOptions>;

type BuilderMethod =
	| "body"
	| "query"
	| "params"
	| "headers"
	| "metadata"
	| "openAPI";

type BuilderRoute = {
	readonly method: HttpMethod;
};

/** Type state carried by a route-builder view. */
export type BuilderState = {
	route: BuilderRoute;
	method: "available" | "selected";
	request: unknown;
	responses: unknown;
	openApi: OpenApiRouteOptions | never;
	used: BuilderMethod;
};

/**
 * Replaces the fields in `TChanges` and keeps the rest of `TState`. Mapping
 * over the fixed `BuilderState` keys keeps the result one flat object, so
 * chained calls don't build up nested intersections.
 *
 * `WithRequest` and `WithResponse` list every field by hand instead. They run
 * once per request segment and per response, and the per-key conditional here
 * measurably raises per-route checker cost on those paths.
 */
type Patch<
	TState extends BuilderState,
	TChanges extends Partial<BuilderState>,
> = {
	[TKey in keyof BuilderState]: TKey extends keyof TChanges
		? TChanges[TKey]
		: TState[TKey];
};

type UseMethod<
	TState extends BuilderState,
	TMethod extends BuilderMethod,
> = Patch<TState, { used: TState["used"] | TMethod }>;

type WhenUnused<
	TState extends BuilderState,
	TMethod extends BuilderMethod,
	TView,
> = TMethod extends TState["used"] ? EmptyObject : TView;

/** Appends a request segment schema. Written out by hand, see `Patch`. */
type WithRequest<
	TState extends BuilderState,
	TKey extends keyof RouteRequestDeclaration,
	TValue,
> = {
	route: TState["route"];
	method: TState["method"];
	request: AppendRequest<TState["request"], TKey, TValue>;
	responses: TState["responses"];
	openApi: TState["openApi"];
	used: TState["used"];
};

type AppendRequest<
	TRequest,
	TKey extends keyof RouteRequestDeclaration,
	TValue,
> = Omit<TRequest, TKey> &
	Record<
		TKey,
		TRequest extends Record<TKey, infer TCurrent extends readonly unknown[]>
			? readonly [...TCurrent, TValue]
			: readonly [TValue]
	>;

type WithHeaders<
	TState extends BuilderState,
	THeaders extends RequestHeadersSchema,
> = Patch<
	TState,
	{ request: AppendRequest<TState["request"], "headers", THeaders> }
>;

type WithContentType<TState extends BuilderState, TContentType> = Patch<
	TState,
	{
		request: Omit<TState["request"], "contentType"> & {
			contentType: TContentType;
		};
	}
>;

/** Adds a declared response. Written out by hand, see `Patch`. */
type WithResponse<
	TState extends BuilderState,
	TStatus extends PropertyKey,
	TResponse,
> = {
	route: TState["route"];
	method: TState["method"];
	request: TState["request"];
	responses: TState["responses"] & Record<TStatus, TResponse>;
	openApi: TState["openApi"];
	used: TState["used"];
};

type WithHttpRoute<
	TState extends BuilderState,
	TMethod extends HttpMethod,
> = Patch<TState, { route: { readonly method: TMethod }; method: "selected" }>;

type MergeMetadata<
	TMetadata extends RouteMetadata | never,
	TLocal extends RouteMetadata,
> = [TMetadata] extends [never]
	? TLocal
	: Omit<TMetadata, keyof TLocal> & TLocal extends infer TMerged
		? { [TKey in keyof TMerged]: TMerged[TKey] }
		: never;

type WithOpenApi<TState extends BuilderState> = Patch<
	TState,
	{ openApi: OpenApiRouteOptions; used: TState["used"] | "openAPI" }
>;

type MetadataDeclaration<TMetadata extends RouteMetadata | never> = [
	TMetadata,
] extends [never]
	? EmptyObject
	: { readonly metadata: TMetadata };

type OpenApiDeclaration<TOpenApi extends OpenApiRouteOptions | never> = [
	TOpenApi,
] extends [never]
	? EmptyObject
	: { readonly openApi: OpenApiRouteOptions };

/** Resolves the public declaration represented by builder state. */
export type PublicDeclarationFor<
	TState,
	TPath extends BuilderPath = AbsolutePath,
	TMetadata extends RouteMetadata | never = never,
> = TState extends BuilderState
	? Merge<
			TState["route"] & {
				readonly path: TPath;
			} & (keyof TState["request"] extends never
					? { request?: never }
					: { request: Merge<TState["request"]> }) & {
					responses: {
						[TStatus in keyof TState["responses"]]: Merge<
							TState["responses"][TStatus]
						>;
					};
				} & MetadataDeclaration<TMetadata> &
				OpenApiDeclaration<TState["openApi"]>
		>
	: never;

/** Type-level hook used by packages that add operations to fluent builders. */
export interface BuilderExtension {
	readonly state: unknown;
	readonly path: BuilderPath;
	readonly metadata: unknown;
	readonly result: unknown;
}

type ApplyExtension<
	TState extends BuilderState,
	TPath extends BuilderPath,
	TMetadata extends RouteMetadata | never,
	TExtension extends BuilderExtension | never,
> = [TExtension] extends [never]
	? EmptyObject
	: (TExtension & {
			readonly state: TState;
			readonly path: TPath;
			readonly metadata: TMetadata;
		})["result"];

type BuilderReceiver<
	TPath extends BuilderPath,
	TMetadata extends RouteMetadata | never,
> = {
	readonly "~restrpc": {
		readonly path: TPath;
	} & MetadataDeclaration<TMetadata>;
};

type ResponseMethods<
	TState extends BuilderState,
	TExtension extends BuilderExtension | never,
> = {
		/** Declares a response status, schema, and HTTP metadata. @see {@link https://rest-rpc.dev/docs/route-builder#choose-plain-outputs-or-status-responses} */
		response<
			const TStatus extends number,
			const TSchema extends StandardSchemaV1 | undefined = undefined,
			const TOptions extends ResponseOptions | undefined = undefined,
			const TPath extends BuilderPath = AbsolutePath,
			const TMetadata extends RouteMetadata | never = never,
		>(
			this: BuilderReceiver<TPath, TMetadata>,
			status: TStatus,
			schema?: TSchema,
			options?: TOptions,
		): RouteBuilderView<
			WithResponse<TState, TStatus, ResponseFor<TSchema, TOptions>>,
			TExtension,
			TPath,
			TMetadata
		>;
		/** Declares a streaming response. @see {@link https://rest-rpc.dev/docs/streaming} */
		streamResponse<
			const TStatus extends number,
			const TSchema extends StandardSchemaV1,
			const TOptions extends StreamResponseOptions | undefined = undefined,
			const TPath extends BuilderPath = AbsolutePath,
			const TMetadata extends RouteMetadata | never = never,
		>(
			this: BuilderReceiver<TPath, TMetadata>,
			status: TStatus,
			schema: TSchema,
			options?: TOptions,
		): RouteBuilderView<
			WithResponse<
				TState,
				TStatus,
				{ kind: "stream"; body: TSchema } & ResponseHeadersFor<TOptions>
			>,
			TExtension,
			TPath,
			TMetadata
		>;
	};

type BodyMethods<
	TState extends BuilderState,
	TExtension extends BuilderExtension | never,
> = {
		/** Declares a request body and its HTTP metadata. @see {@link https://rest-rpc.dev/docs/route-builder#declare-request-segments} */
		body<
			const TSchema extends StandardSchemaV1,
			const TOptions extends BodyOptions | undefined = undefined,
			const TPath extends BuilderPath = AbsolutePath,
			const TMetadata extends RouteMetadata | never = never,
		>(
			this: BuilderReceiver<TPath, TMetadata>,
			schema: TSchema,
			options?: TOptions,
		): RouteBuilderView<
			WithContentType<
				WithRequest<TState, "body", TSchema>,
				TState["request"] extends { contentType: infer TContentType }
					? TContentType
					: ContentTypeFor<TOptions>
			>,
			TExtension,
			TPath,
			TMetadata
		>;
	};

type RequestMethods<
	TState extends BuilderState,
	TExtension extends BuilderExtension | never,
> = {
		/** Declares URL query parameters. @see {@link https://rest-rpc.dev/docs/route-builder#declare-request-segments} */
		query<
			const TSchema extends RequestQuerySchema,
			const TPath extends BuilderPath = AbsolutePath,
			const TMetadata extends RouteMetadata | never = never,
		>(
			this: BuilderReceiver<TPath, TMetadata>,
			schema: TSchema,
		): RouteBuilderView<
			WithRequest<TState, "query", TSchema>,
			TExtension,
			TPath,
			TMetadata
		>;
		/** Declares path parameters. @see {@link https://rest-rpc.dev/docs/route-builder#declare-request-segments} */
			params<
				const TSchema extends RequestParamsSchema,
				const TPath extends BuilderPath = AbsolutePath,
				const TMetadata extends RouteMetadata | never = never,
			>(
				this: BuilderReceiver<TPath, TMetadata>,
				schema: TSchema,
			): RouteBuilderView<
				WithRequest<TState, "params", TSchema>,
				TExtension,
				TPath,
				TMetadata
			>;
		/** Declares request headers. @see {@link https://rest-rpc.dev/docs/route-builder#declare-request-segments} */
		headers<
			const THeaders extends RequestHeadersSchema,
			const TPath extends BuilderPath = AbsolutePath,
			const TMetadata extends RouteMetadata | never = never,
		>(
			this: BuilderReceiver<TPath, TMetadata>,
			schema: THeaders,
		): RouteBuilderView<
			WithHeaders<TState, THeaders>,
			TExtension,
			TPath,
			TMetadata
		>;
	} & WhenUnused<
		TState,
		"metadata",
		{
			/** Adds application metadata. @see {@link https://rest-rpc.dev/docs/route-builder#add-metadata-and-openapi-details} */
			metadata<
				const TLocal extends RouteMetadata,
				const TPath extends BuilderPath = AbsolutePath,
				const TMetadata extends RouteMetadata | never = never,
			>(
				this: BuilderReceiver<TPath, TMetadata>,
				metadata: TLocal,
			): RouteBuilderView<
				UseMethod<TState, "metadata">,
				TExtension,
				TPath,
				MergeMetadata<TMetadata, TLocal>
			>;
		}
	> &
	WhenUnused<
		TState,
		"openAPI",
		{
			/** Adds OpenAPI metadata. @see {@link https://rest-rpc.dev/docs/openapi#route-metadata} */
			openAPI<
				const TPath extends BuilderPath = AbsolutePath,
				const TMetadata extends RouteMetadata | never = never,
			>(
				this: BuilderReceiver<TPath, TMetadata>,
				openApi: OpenApiRouteOptions,
			): RouteBuilderView<WithOpenApi<TState>, TExtension, TPath, TMetadata>;
		}
	>;

type HttpMethods<
	TState extends BuilderState,
	TExtension extends BuilderExtension | never,
> = TState["method"] extends "available"
	? {
			get<
				const TPath extends BuilderPath = undefined,
				const TMetadata extends RouteMetadata | never = never,
			>(
				this: BuilderReceiver<BuilderPath, TMetadata>,
				path?: TPath,
			): RouteBuilderView<
				WithHttpRoute<TState, "GET">,
				TExtension,
				TPath,
				TMetadata
			>;
			post<
				const TPath extends BuilderPath = undefined,
				const TMetadata extends RouteMetadata | never = never,
			>(
				this: BuilderReceiver<BuilderPath, TMetadata>,
				path?: TPath,
			): RouteBuilderView<
				WithHttpRoute<TState, "POST">,
				TExtension,
				TPath,
				TMetadata
			>;
			put<
				const TPath extends BuilderPath = undefined,
				const TMetadata extends RouteMetadata | never = never,
			>(
				this: BuilderReceiver<BuilderPath, TMetadata>,
				path?: TPath,
			): RouteBuilderView<
				WithHttpRoute<TState, "PUT">,
				TExtension,
				TPath,
				TMetadata
			>;
			patch<
				const TPath extends BuilderPath = undefined,
				const TMetadata extends RouteMetadata | never = never,
			>(
				this: BuilderReceiver<BuilderPath, TMetadata>,
				path?: TPath,
			): RouteBuilderView<
				WithHttpRoute<TState, "PATCH">,
				TExtension,
				TPath,
				TMetadata
			>;
			delete<
				const TPath extends BuilderPath = undefined,
				const TMetadata extends RouteMetadata | never = never,
			>(
				this: BuilderReceiver<BuilderPath, TMetadata>,
				path?: TPath,
			): RouteBuilderView<
				WithHttpRoute<TState, "DELETE">,
				TExtension,
				TPath,
				TMetadata
			>;
		}
	: EmptyObject;

type AvailableMethods<TState, TExtension> = TState extends BuilderState
	? HttpMethods<TState, Extract<TExtension, BuilderExtension>> &
			ResponseMethods<TState, Extract<TExtension, BuilderExtension>> &
			BodyMethods<TState, Extract<TExtension, BuilderExtension>> &
			RequestMethods<TState, Extract<TExtension, BuilderExtension>>
	: never;

/** Fluent type-level view over the loose route-builder runtime. */
export type RouteBuilderView<
	TState,
	TExtension = never,
	TPath extends BuilderPath = AbsolutePath,
	TMetadata extends RouteMetadata | never = never,
> = {
	readonly "~restrpc": PublicDeclarationFor<TState, TPath, TMetadata>;
} & AvailableMethods<TState, TExtension> &
	ApplyExtension<
		Extract<TState, BuilderState>,
		TPath,
		TMetadata,
		Extract<TExtension, BuilderExtension>
	>;

type DerivedState = {
	route: { readonly method: "POST" };
	method: "available";
	request: EmptyObject;
	responses: EmptyObject;
	openApi: never;
	used: never;
};

/** Type-level view of the root route builder. */
export type PublicRouteBuilder<
	TExtension extends BuilderExtension | never = never,
> = {
	readonly "~restrpc": { readonly path: undefined };
} & Omit<
	RouteBuilderView<DerivedState, TExtension, undefined, never>,
	"~restrpc"
>;
