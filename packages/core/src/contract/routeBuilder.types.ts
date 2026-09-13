import type { StandardSchemaV1 } from "../standard-schema/index.ts";
import type {
	CustomBody,
	CustomBodyContentType,
	CustomResponseBody,
	CustomResponseInput,
	CustomResponseValue,
	FormBody,
	FormBodySchema,
	MultipartBody,
	MultipartBodySchema,
	NoBody,
	Stream,
} from "./body.ts";
import type {
	CommonOpenApiRouteOptions,
	HttpMethod,
	OpenApiRouteOptions,
	RouteMetadata,
	RouteRequestDeclaration,
} from "./routeDeclaration.ts";
import type {
	JsonQuery,
	RequestHeadersDeclaration,
	RequestHeadersSchema,
	RequestParamsSchema,
	RequestQuerySchema,
} from "./request.ts";
import type { RegularResponseDeclaration, RouteResponses } from "./response.ts";

type EmptyObject = Record<never, never>;

/** Defaults applied to routes created from a configured builder. */
export type RouteBuilderOptions = {
	pathPrefix?: string;
	metadata?: RouteMetadata;
	responses?: RouteResponses;
	headers?: RequestHeadersSchema;
	openApi?: CommonOpenApiRouteOptions;
};

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
};

type UseMethod<TState extends BuilderState, TMethod extends BuilderMethod> = {
	route: TState["route"];
	request: TState["request"];
	responses: TState["responses"];
	openApi: TState["openApi"];
	used: TState["used"] | TMethod;
};

type WhenUnused<
	TState extends BuilderState,
	TMethod extends BuilderMethod,
	TView,
> = TMethod extends TState["used"] ? EmptyObject : TView;

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
			} & MetadataDeclaration<TMetadata> &
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
> = {
	/** Declares a response status and schema. @see {@link https://rest-rpc.dev/docs/contract/declaration#responses} */
	response<
		const TStatus extends number,
		const TSchema extends RegularResponseDeclaration | undefined = undefined,
		const TPath extends string = string,
		const TMetadata extends RouteMetadata | never = never,
	>(
		this: BuilderReceiver<TPath, TMetadata>,
		status: TStatus,
		schema?: TSchema,
	): RouteBuilderView<
		WithResponse<
			TState,
			TStatus,
			TSchema extends RegularResponseDeclaration ? TSchema : NoBody
		>,
		TExtension,
		TPath,
		TMetadata
	>;
	/** Declares a custom-content response. @see {@link https://rest-rpc.dev/docs/http-responses#response-with-custom-content-type} */
	customResponse<
		const TStatus extends number,
		const TSchema extends StandardSchemaV1<unknown, CustomResponseValue>,
		const TContentType extends CustomBodyContentType,
		const TPath extends string = string,
		const TMetadata extends RouteMetadata | never = never,
	>(
		this: BuilderReceiver<TPath, TMetadata>,
		status: TStatus,
		input: CustomResponseInput<TSchema, TContentType>,
	): RouteBuilderView<
		WithResponse<TState, TStatus, CustomResponseBody<TSchema, TContentType>>,
		TExtension,
		TPath,
		TMetadata
	>;
	/** Declares an NDJSON response stream. @see {@link https://rest-rpc.dev/docs/http-responses#streaming-ndjson-responses} */
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
		WithResponse<TState, TStatus, Stream<TSchema>>,
		TExtension,
		TPath,
		TMetadata
	>;
	/** Declares a custom-content response stream. @see {@link https://rest-rpc.dev/docs/http-responses#streaming-responses-with-custom-content-type} */
	customStreamResponse<
		const TStatus extends number,
		const TSchema extends StandardSchemaV1<unknown, CustomResponseValue>,
		const TContentType extends CustomBodyContentType,
		const TPath extends string = string,
		const TMetadata extends RouteMetadata | never = never,
	>(
		this: BuilderReceiver<TPath, TMetadata>,
		status: TStatus,
		input: CustomResponseInput<TSchema, TContentType>,
	): RouteBuilderView<
		WithResponse<
			TState,
			TStatus,
			Stream<CustomResponseBody<TSchema, TContentType>>
		>,
		TExtension,
		TPath,
		TMetadata
	>;
};

type BodyMethods<
	TState extends BuilderState,
	TExtension extends BuilderExtension | never,
> = WhenUnused<
	TState,
	"body",
	{
		/** Declares a JSON request body. @see {@link https://rest-rpc.dev/docs/http-requests#request-with-json-body} */
		body<
			const TSchema extends StandardSchemaV1,
			const TPath extends string = string,
			const TMetadata extends RouteMetadata | never = never,
		>(
			this: BuilderReceiver<TPath, TMetadata>,
			schema: TSchema,
		): RouteBuilderView<
			WithRequest<TState, "body", TSchema, "body">,
			TExtension,
			TPath,
			TMetadata
		>;
		/** Declares a URL-encoded form body. @see {@link https://rest-rpc.dev/docs/http-requests#request-with-form-body} */
		formBody<
			const TSchema extends FormBodySchema,
			const TPath extends string = string,
			const TMetadata extends RouteMetadata | never = never,
		>(
			this: BuilderReceiver<TPath, TMetadata>,
			schema: TSchema,
		): RouteBuilderView<
			WithRequest<TState, "body", FormBody<TSchema>, "body">,
			TExtension,
			TPath,
			TMetadata
		>;
		/** Declares a multipart form body. @see {@link https://rest-rpc.dev/docs/http-requests#request-with-multipart-body} */
		multipartBody<
			const TSchema extends MultipartBodySchema,
			const TPath extends string = string,
			const TMetadata extends RouteMetadata | never = never,
		>(
			this: BuilderReceiver<TPath, TMetadata>,
			schema: TSchema,
		): RouteBuilderView<
			WithRequest<TState, "body", MultipartBody<TSchema>, "body">,
			TExtension,
			TPath,
			TMetadata
		>;
		/** Declares a custom-content request body. @see {@link https://rest-rpc.dev/docs/http-requests#request-with-custom-content-type} */
		customBody<
			const TSchema extends StandardSchemaV1,
			const TPath extends string = string,
			const TMetadata extends RouteMetadata | never = never,
		>(
			this: BuilderReceiver<TPath, TMetadata>,
			schema: TSchema,
		): RouteBuilderView<
			WithRequest<TState, "body", CustomBody<TSchema, undefined>, "body">,
			TExtension,
			TPath,
			TMetadata
		>;
		customBody<
			const TSchema extends StandardSchemaV1,
			const TContentType extends CustomBodyContentType,
			const TPath extends string = string,
			const TMetadata extends RouteMetadata | never = never,
		>(
			this: BuilderReceiver<TPath, TMetadata>,
			input: {
				schema: TSchema;
				contentType: TContentType;
			},
		): RouteBuilderView<
			WithRequest<TState, "body", CustomBody<TSchema, TContentType>, "body">,
			TExtension,
			TPath,
			TMetadata
		>;
	}
>;

type RequestMethods<
	TState extends BuilderState,
	TExtension extends BuilderExtension | never,
> = WhenUnused<
	TState,
	"query",
	{
		/** Declares URL query parameters. @see {@link https://rest-rpc.dev/docs/contract/declaration#request-model} */
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
		/** Declares a JSON-encoded query value. @see {@link https://rest-rpc.dev/docs/contract/declaration#json-query} */
		jsonQuery<
			const TSchema extends StandardSchemaV1,
			const TPath extends string = string,
			const TMetadata extends RouteMetadata | never = never,
		>(
			this: BuilderReceiver<TPath, TMetadata>,
			schema: TSchema,
		): RouteBuilderView<
			WithRequest<TState, "query", JsonQuery<TSchema>, "query">,
			TExtension,
			TPath,
			TMetadata
		>;
	}
> &
	WhenUnused<
		TState,
		"params",
		{
			/** Declares path parameters. @see {@link https://rest-rpc.dev/docs/contract/declaration#path-params} */
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
	> &
	WhenUnused<
		TState,
		"headers",
		{
			/** Declares request headers. @see {@link https://rest-rpc.dev/docs/contract/declaration#request-model} */
			headers<
				const THeaders extends RequestHeadersSchema,
				const TPath extends string = string,
				const TMetadata extends RouteMetadata | never = never,
			>(
				this: BuilderReceiver<TPath, TMetadata>,
				schema: THeaders,
			): RouteBuilderView<
				WithRequest<
					TState,
					"headers",
					TState["request"] extends {
						headers: infer TCommon extends RequestHeadersDeclaration;
					}
						? TCommon & { local: THeaders }
						: { local: THeaders },
					"headers"
				>,
				TExtension,
				TPath,
				TMetadata
			>;
		}
	> &
	WhenUnused<
		TState,
		"metadata",
		{
			/** Adds application metadata. @see {@link https://rest-rpc.dev/docs/contract/declaration#shared-route-options} */
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

type HttpMethods<
	TState extends BuilderState,
	TExtension extends BuilderExtension | never,
> = ResponseMethods<TState, TExtension> &
	BodyMethods<TState, TExtension> &
	RequestMethods<TState, TExtension>;

type ProcedureMethods<
	TState extends BuilderState,
	TExtension extends BuilderExtension | never,
> = WhenUnused<
	TState,
	"input",
	{
		/** Declares the procedure's JSON input schema. */
		input<const TSchema extends StandardSchemaV1>(
			schema: TSchema,
		): RouteBuilderView<
			WithRequest<TState, "body", TSchema, "input">,
			TExtension,
			"",
			never
		>;
	}
> &
	WhenUnused<
		TState,
		"output",
		{
			/** Declares the procedure's JSON output schema. */
			output<const TSchema extends StandardSchemaV1>(
				schema: TSchema,
			): RouteBuilderView<
				WithResponse<UseMethod<TState, "output">, 200, TSchema>,
				TExtension,
				"",
				never
			>;
		}
	>;

type AvailableMethods<TState, TExtension> = TState extends BuilderState
	? TState["route"]["kind"] extends "procedure"
		? ProcedureMethods<TState, Extract<TExtension, BuilderExtension>>
		: HttpMethods<TState, Extract<TExtension, BuilderExtension>>
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

type OptionValue<TOptions, TKey extends PropertyKey, TFallback> =
	TOptions extends Record<TKey, infer TValue> ? TValue : TFallback;

type RequestFor<TOptions> = TOptions extends {
	headers: infer THeaders extends RequestHeadersSchema;
}
	? { headers: { inherited: THeaders } }
	: EmptyObject;

type PathFor<TOptions, TPath extends string> = TOptions extends {
	pathPrefix: infer TPrefix extends string;
}
	? `${TPrefix}${TPath}`
	: TPath;

type MetadataFor<TOptions> = TOptions extends {
	metadata: infer TMetadata extends RouteMetadata;
}
	? TMetadata
	: never;

type OpenApiFor<TOptions> = TOptions extends {
	openApi: CommonOpenApiRouteOptions;
}
	? OpenApiRouteOptions
	: never;

type HttpStateFor<TOptions, TMethod extends HttpMethod> = {
	route: {
		readonly kind: "http";
		readonly method: TMethod;
	};
	request: RequestFor<TOptions>;
	responses: OptionValue<TOptions, "responses", EmptyObject>;
	openApi: OpenApiFor<TOptions>;
	used: never;
};

type ProcedureState<TRequest, TResponses, TUsed extends BuilderMethod> = {
	route: {
		readonly kind: "procedure";
		readonly method: "POST";
	};
	request: TRequest;
	responses: TResponses;
	openApi: never;
	used: TUsed;
};

type HttpRootMethods<TOptions, TExtension extends BuilderExtension | never> = {
	[TMethod in Lowercase<HttpMethod>]: <const TPath extends string>(
		path: TPath,
	) => RouteBuilderView<
		HttpStateFor<TOptions, Uppercase<TMethod> & HttpMethod>,
		TExtension,
		PathFor<TOptions, TPath>,
		MetadataFor<TOptions>
	>;
};

type ProcedureRootMethods<TExtension extends BuilderExtension | never> = {
	/** Declares the procedure's JSON input schema. */
	input<const TInput extends StandardSchemaV1>(
		schema: TInput,
	): RouteBuilderView<
		ProcedureState<{ body: TInput }, EmptyObject, "input">,
		TExtension,
		"",
		never
	>;
	/** Declares a no-input procedure with a `200` JSON response. */
	output<const TOutput extends StandardSchemaV1>(
		schema: TOutput,
	): RouteBuilderView<
		ProcedureState<EmptyObject, { 200: TOutput }, "output">,
		TExtension,
		"",
		never
	>;
} & ApplyExtension<
	ProcedureState<EmptyObject, EmptyObject, never>,
	"",
	never,
	TExtension
>;

type RouteBuilderInput<TOptions extends RouteBuilderOptions> = TOptions & {
	[TKey in Extract<keyof TOptions, "strictStatusCodes">]: never;
};

/** Type-level view of the root route builder. */
export type RootRouteBuilder<
	TOptions = undefined,
	TExtension extends BuilderExtension | never = never,
> = {
	readonly "~restrpc": EmptyObject;
	/** Creates a builder with shared route options. */
	with<const TNextOptions extends RouteBuilderOptions>(
		options: RouteBuilderInput<TNextOptions>,
	): RootRouteBuilder<TNextOptions, TExtension>;
} & HttpRootMethods<TOptions, TExtension> &
	(TOptions extends undefined ? ProcedureRootMethods<TExtension> : EmptyObject);
