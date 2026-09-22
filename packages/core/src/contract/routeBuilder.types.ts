import type { StandardSchemaV1 } from "../standard-schema/index.ts";
import type { BodyOptions } from "./body.ts";
import type {
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
import type { ResponseOptions } from "./response.ts";

type EmptyObject = Record<never, never>;
type JsonContentType = "application/json";

type ContentTypeFor<TOptions> = TOptions extends BodyOptions
	? TOptions["contentType"]
	: JsonContentType;

type ResponseFor<TSchema, TOptions> = TSchema extends StandardSchemaV1
	? {
			body: TSchema;
			contentType: ContentTypeFor<TOptions>;
		} & (TOptions extends { headers: infer THeaders }
			? { headers: THeaders }
			: EmptyObject)
	: { body: undefined } & (TOptions extends { headers: infer THeaders }
			? { headers: THeaders }
			: EmptyObject);

type BuilderMethod =
	| "body"
	| "input"
	| "output"
	| "query"
	| "params"
	| "headers"
	| "metadata"
	| "openAPI";

type BuilderRoute = {
	readonly kind: "http" | "procedure";
	readonly method: HttpMethod;
};

/** Type state carried by a route-builder view. */
export type BuilderState = {
	route: BuilderRoute;
	request: unknown;
	responses: unknown;
	openApi: OpenApiRouteOptions | never;
	used: BuilderMethod;
	input: "none" | "input" | "segments";
	output: "none" | "output" | "response";
};

type UseMethod<TState extends BuilderState, TMethod extends BuilderMethod> = {
	route: TState["route"];
	request: TState["request"];
	responses: TState["responses"];
	openApi: TState["openApi"];
	used: TState["used"] | TMethod;
	input: TState["input"];
	output: TState["output"];
};

type WhenUnused<
	TState extends BuilderState,
	TMethod extends BuilderMethod,
	TView,
> = TMethod extends TState["used"] ? EmptyObject : TView;

type WhenInputAvailable<
	TState extends BuilderState,
	TView,
> = TState["input"] extends "none" ? TView : EmptyObject;
type WhenSegmentsAvailable<
	TState extends BuilderState,
	TView,
> = TState["input"] extends "input" ? EmptyObject : TView;
type WhenOutputAvailable<
	TState extends BuilderState,
	TView,
> = TState["output"] extends "none" ? TView : EmptyObject;
type WhenResponsesAvailable<
	TState extends BuilderState,
	TView,
> = TState["output"] extends "output" ? EmptyObject : TView;

type WithRequest<
	TState extends BuilderState,
	TKey extends keyof RouteRequestDeclaration,
	TValue,
	TMethod extends BuilderMethod,
> = {
	route: TState["route"];
	request: Omit<TState["request"], TKey> & Record<TKey, TValue>;
	responses: TState["responses"];
	openApi: TState["openApi"];
	used: TState["used"] | TMethod;
	input: "segments";
	output: TState["output"];
};

type WithResponse<
	TState extends BuilderState,
	TStatus extends PropertyKey,
	TResponse,
> = {
	route: TState["route"];
	request: TState["request"];
	responses: TState["responses"] & Record<TStatus, TResponse>;
	openApi: TState["openApi"];
	used: TState["used"];
	input: TState["input"];
	output: "response";
};

type WithPlainOutput<TState extends BuilderState, TResponse> = Omit<
	WithResponse<TState, 200, TResponse>,
	"output"
> & { output: "output" };

type WithFlatInput<
	TState extends BuilderState,
	TSchema extends StandardSchemaV1,
	TOptions extends BodyOptions | undefined,
> = {
	route: TState["route"];
	request: TState["request"] &
		(TState["route"]["method"] extends "GET"
			? { query: TSchema }
			: { body: TSchema; contentType: ContentTypeFor<TOptions> });
	responses: TState["responses"];
	openApi: TState["openApi"];
	used: TState["used"] | "input";
	input: "input";
	output: TState["output"];
};

type MergeMetadata<
	TMetadata extends RouteMetadata | never,
	TLocal extends RouteMetadata,
> = [TMetadata] extends [never]
	? TLocal
	: Omit<TMetadata, keyof TLocal> & TLocal extends infer TMerged
		? { [TKey in keyof TMerged]: TMerged[TKey] }
		: never;

type WithOpenApi<TState extends BuilderState> = {
	route: TState["route"];
	request: TState["request"];
	responses: TState["responses"];
	openApi: OpenApiRouteOptions;
	used: TState["used"] | "openAPI";
	input: TState["input"];
	output: TState["output"];
};

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
	TPath extends string = string,
	TMetadata extends RouteMetadata | never = never,
> = TState extends BuilderState
	? TState["route"] & {
			readonly path: TPath;
		} & (keyof TState["request"] extends never
				? { request?: never }
				: { request: TState["request"] }) & {
				responses: TState["responses"];
			} & (TState["input"] extends "none"
				? EmptyObject
				: { readonly input: TState["input"] }) &
			(TState["output"] extends "none"
				? EmptyObject
				: { readonly output: TState["output"] }) &
			MetadataDeclaration<TMetadata> &
			OpenApiDeclaration<TState["openApi"]>
	: never;

/** Type-level hook used by packages that add operations to fluent builders. */
export interface BuilderExtension {
	readonly state: unknown;
	readonly path: string;
	readonly metadata: unknown;
	readonly result: unknown;
}

type ApplyExtension<
	TState extends BuilderState,
	TPath extends string,
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
	TPath extends string,
	TMetadata extends RouteMetadata | never,
> = {
	readonly "~restrpc": {
		readonly path: TPath;
	} & MetadataDeclaration<TMetadata>;
};

type ResponseMethods<
	TState extends BuilderState,
	TExtension extends BuilderExtension | never,
> = WhenResponsesAvailable<
	TState,
	{
		/** Declares a response status, schema, and HTTP metadata. @see {@link https://rest-rpc.dev/docs/http-behavior/serialization} */
		response<
			const TStatus extends number,
			const TSchema extends StandardSchemaV1 | undefined = undefined,
			const TOptions extends ResponseOptions | undefined = undefined,
			const TPath extends string = string,
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
		/** Declares a streaming response. @see {@link https://rest-rpc.dev/docs/http-behavior/serialization#streaming} */
		streamResponse<
			const TStatus extends number,
			const TSchema extends StandardSchemaV1,
			const TPath extends string = string,
			const TMetadata extends RouteMetadata | never = never,
		>(
			this: BuilderReceiver<TPath, TMetadata>,
			status: TStatus,
			schema: TSchema,
		): RouteBuilderView<
			WithResponse<TState, TStatus, { kind: "stream"; body: TSchema }>,
			TExtension,
			TPath,
			TMetadata
		>;
	}
>;

type BodyMethods<
	TState extends BuilderState,
	TExtension extends BuilderExtension | never,
> = WhenSegmentsAvailable<
	TState,
	WhenUnused<
		TState,
		"body",
		{
			/** Declares a request body and its HTTP metadata. @see {@link https://rest-rpc.dev/docs/http-behavior/serialization} */
			body<
				const TSchema extends StandardSchemaV1,
				const TOptions extends BodyOptions | undefined = undefined,
				const TPath extends string = string,
				const TMetadata extends RouteMetadata | never = never,
			>(
				this: BuilderReceiver<TPath, TMetadata>,
				schema: TSchema,
				options?: TOptions,
			): RouteBuilderView<
				WithRequest<
					WithRequest<TState, "body", TSchema, "body">,
					"contentType",
					ContentTypeFor<TOptions>,
					"body"
				>,
				TExtension,
				TPath,
				TMetadata
			>;
		}
	>
>;

type RequestMethods<
	TState extends BuilderState,
	TExtension extends BuilderExtension | never,
> = WhenSegmentsAvailable<
	TState,
	WhenUnused<
		TState,
		"query",
		{
			/** Declares URL query parameters. @see {@link https://rest-rpc.dev/docs/route-builder#declare-request-segments} */
			query<
				const TSchema extends RequestQuerySchema,
				const TPath extends string = string,
				const TMetadata extends RouteMetadata | never = never,
			>(
				this: BuilderReceiver<TPath, TMetadata>,
				schema: TSchema,
			): RouteBuilderView<
				WithRequest<TState, "query", TSchema, "query">,
				TExtension,
				TPath,
				TMetadata
			>;
		}
	>
> &
	WhenSegmentsAvailable<
		TState,
		WhenUnused<
			TState,
			"params",
			{
				/** Declares path parameters. @see {@link https://rest-rpc.dev/docs/route-builder#declare-request-segments} */
				params<
					const TSchema extends RequestParamsSchema,
					const TPath extends string = string,
					const TMetadata extends RouteMetadata | never = never,
				>(
					this: BuilderReceiver<TPath, TMetadata>,
					schema: TSchema,
				): RouteBuilderView<
					WithRequest<TState, "params", TSchema, "params">,
					TExtension,
					TPath,
					TMetadata
				>;
			}
		>
	> &
	WhenSegmentsAvailable<
		TState,
		WhenUnused<
			TState,
			"headers",
			{
				/** Declares request headers. @see {@link https://rest-rpc.dev/docs/route-builder#declare-request-segments} */
				headers<
					const THeaders extends RequestHeadersSchema,
					const TPath extends string = string,
					const TMetadata extends RouteMetadata | never = never,
				>(
					this: BuilderReceiver<TPath, TMetadata>,
					schema: THeaders,
				): RouteBuilderView<
					WithRequest<TState, "headers", THeaders, "headers">,
					TExtension,
					TPath,
					TMetadata
				>;
			}
		>
	> &
	WhenUnused<
		TState,
		"metadata",
		{
			/** Adds application metadata. @see {@link https://rest-rpc.dev/docs/route-builder#add-metadata-and-openapi-details} */
			metadata<
				const TLocal extends RouteMetadata,
				const TPath extends string = string,
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
				const TPath extends string = string,
				const TMetadata extends RouteMetadata | never = never,
			>(
				this: BuilderReceiver<TPath, TMetadata>,
				openApi: OpenApiRouteOptions,
			): RouteBuilderView<WithOpenApi<TState>, TExtension, TPath, TMetadata>;
		}
	>;

type FlatMethods<
	TState extends BuilderState,
	TExtension extends BuilderExtension | never,
> = WhenInputAvailable<
	TState,
	{
		/** Declares one flat input value. GET inputs use query encoding; other methods use a body. */
		input<
			const TSchema extends (TState["route"]["method"] extends "GET"
				? RequestQuerySchema
				: StandardSchemaV1),
			const TOptions extends BodyOptions | undefined = undefined,
			const TPath extends string = string,
			const TMetadata extends RouteMetadata | never = never,
		>(
			this: BuilderReceiver<TPath, TMetadata>,
			schema: TSchema,
			options?: TState["route"]["method"] extends "GET" ? never : TOptions,
		): RouteBuilderView<
			WithFlatInput<TState, TSchema, TOptions>,
			TExtension,
			TPath,
			TMetadata
		>;
	}
> &
	WhenOutputAvailable<
		TState,
		{
			/** Declares one plain output value. */
			output<
				const TSchema extends StandardSchemaV1,
				const TOptions extends BodyOptions | undefined = undefined,
				const TPath extends string = string,
				const TMetadata extends RouteMetadata | never = never,
			>(
				this: BuilderReceiver<TPath, TMetadata>,
				schema: TSchema,
				options?: TOptions,
			): RouteBuilderView<
				WithPlainOutput<
					UseMethod<TState, "output">,
					ResponseFor<TSchema, TOptions>
				>,
				TExtension,
				TPath,
				TMetadata
			>;
			/** Declares a streaming plain output. */
			streamOutput<
				const TSchema extends StandardSchemaV1,
				const TPath extends string = string,
				const TMetadata extends RouteMetadata | never = never,
			>(
				this: BuilderReceiver<TPath, TMetadata>,
				schema: TSchema,
			): RouteBuilderView<
				WithPlainOutput<
					UseMethod<TState, "output">,
					{ kind: "stream"; body: TSchema }
				>,
				TExtension,
				TPath,
				TMetadata
			>;
		}
	>;

type AvailableMethods<TState, TExtension> = TState extends BuilderState
	? FlatMethods<TState, Extract<TExtension, BuilderExtension>> &
			ResponseMethods<TState, Extract<TExtension, BuilderExtension>> &
			(TState["route"]["method"] extends "GET"
				? EmptyObject
				: BodyMethods<TState, Extract<TExtension, BuilderExtension>>) &
			RequestMethods<TState, Extract<TExtension, BuilderExtension>>
	: never;

/** Fluent type-level view over the loose route-builder runtime. */
export type RouteBuilderView<
	TState,
	TExtension = never,
	TPath extends string = string,
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
	route: { readonly kind: "procedure"; readonly method: "POST" };
	request: EmptyObject;
	responses: EmptyObject;
	openApi: never;
	used: never;
	input: "none";
	output: "none";
};

type HttpStateFor<TMethod extends HttpMethod> = {
	route: { readonly kind: "http"; readonly method: TMethod };
	request: EmptyObject;
	responses: EmptyObject;
	openApi: never;
	used: never;
	input: "none";
	output: "none";
};

type HttpRootMethods<TExtension extends BuilderExtension | never> = {
	get<const TPath extends string>(
		path: TPath,
	): RouteBuilderView<HttpStateFor<"GET">, TExtension, TPath>;
	post<const TPath extends string>(
		path: TPath,
	): RouteBuilderView<HttpStateFor<"POST">, TExtension, TPath>;
	put<const TPath extends string>(
		path: TPath,
	): RouteBuilderView<HttpStateFor<"PUT">, TExtension, TPath>;
	patch<const TPath extends string>(
		path: TPath,
	): RouteBuilderView<HttpStateFor<"PATCH">, TExtension, TPath>;
	delete<const TPath extends string>(
		path: TPath,
	): RouteBuilderView<HttpStateFor<"DELETE">, TExtension, TPath>;
};

/** Type-level view of the root route builder. */
export type RootRouteBuilder<
	TOptions = undefined,
	TExtension extends BuilderExtension | never = never,
> = TOptions extends undefined
	? {
			readonly "~restrpc": { readonly path: "" };
		} & HttpRootMethods<TExtension> &
			Omit<RouteBuilderView<DerivedState, TExtension, "", never>, "~restrpc">
	: never;
