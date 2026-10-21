import type { StandardSchemaV1 } from "../standard-schema/index.ts";
import type { DefaultBodyContentType } from "./body.ts";
import type {
	AbsolutePath,
	HttpMethod,
	OpenApiRouteOptions,
	RouteMetadata,
	RouteRequestDeclaration,
} from "./routeDeclaration.ts";
import type { EmptyObject, Merge } from "../utils/typeUtils.ts";

/**
 * Type-level state of a route builder.
 *
 * @remarks `method` is `undefined` only on the untouched root builder. `omit`
 * lists the builder methods that are no longer available.
 */
export type BuilderState = {
	method: HttpMethod | undefined;
	path: AbsolutePath | undefined;
	prefix: AbsolutePath | undefined;
	request: object;
	responses: object;
	metadata: RouteMetadata | undefined;
	openApi: boolean;
	omit: PropertyKey;
};

/** Builder state of the untouched root builder. */
export type RootBuilderState = {
	method: undefined;
	path: undefined;
	prefix: undefined;
	request: EmptyObject;
	responses: EmptyObject;
	metadata: undefined;
	openApi: false;
	omit: never;
};

/**
 * Replaces the `TChanges` fields of a builder state. Leaving the root without
 * choosing a method selects `POST`, matching the runtime default.
 */
export type NextState<
	TState extends BuilderState,
	TChanges extends Partial<BuilderState>,
> = {
	[TKey in keyof BuilderState]: TKey extends keyof TChanges
		? TChanges[TKey]
		: TKey extends "method"
			? TState["method"] extends HttpMethod
				? TState["method"]
				: "POST"
			: TState[TKey];
};

/**
 * Maps a builder state to the builder type returned by builder methods, so
 * packages extending the builder get their own builder type back.
 */
export interface BuilderKind {
	// `unknown` so applying a kind does not intersect the state with `BuilderState`.
	readonly state: unknown;
	readonly builder: unknown;
}

/** Resolves the builder type of a builder kind for a state. */
export type BuilderFor<
	TKind extends BuilderKind,
	TState extends BuilderState,
> = (TKind & { readonly state: TState })["builder"];

/** Resolves the public route declaration represented by builder state. */
export type DeclarationFor<TState extends BuilderState> =
	TState["method"] extends HttpMethod
		? Merge<
				{
					readonly method: TState["method"];
					readonly path: TState["path"];
				} & (keyof TState["request"] extends never
					? { request?: never }
					: { request: Merge<TState["request"]> }) & {
						responses: {
							[TStatus in keyof TState["responses"]]: Merge<
								TState["responses"][TStatus]
							>;
						};
					} & (TState["metadata"] extends RouteMetadata
						? { readonly metadata: TState["metadata"] }
						: EmptyObject) &
					(TState["prefix"] extends AbsolutePath
						? { readonly prefix: TState["prefix"] }
						: EmptyObject) &
					(TState["openApi"] extends true
						? { readonly openApi: OpenApiRouteOptions }
						: EmptyObject)
			>
		: { readonly path: undefined };

type HttpMethodName = "get" | "post" | "put" | "patch" | "delete";

/** Joins a prefix and a path the same way the route builder does at runtime. */
export type JoinPrefix<
	TPrefix extends AbsolutePath | undefined,
	TPath extends AbsolutePath,
> = TPrefix extends AbsolutePath
	? TPath extends "/"
		? TPrefix
		: `${TPrefix}${TPath}`
	: TPath;

export type WithPrefix<
	TState extends BuilderState,
	TPrefix extends AbsolutePath,
> = NextState<TState, { prefix: JoinPrefix<TState["prefix"], TPrefix> }>;

// GET routes cannot declare a body, so `get` and `body` exclude each other. A
// method path includes the prefix, so no prefix can be added after it.
export type WithHttpMethod<
	TState extends BuilderState,
	TMethod extends HttpMethod,
	TPath extends AbsolutePath | undefined,
> = NextState<
	TState,
	{
		method: TMethod;
		path: TPath extends AbsolutePath
			? JoinPrefix<TState["prefix"], TPath>
			: undefined;
		omit:
			| TState["omit"]
			| HttpMethodName
			| "prefix"
			| (TMethod extends "GET" ? "body" : never);
	}
>;

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

export type WithRequest<
	TState extends BuilderState,
	TKey extends "query" | "params" | "headers",
	TSchema,
> = NextState<
	TState,
	{ request: AppendRequest<TState["request"], TKey, TSchema> }
>;

/** Normalizes a `.body()` or `.response()` argument to a media type record. */
export type ContentFor<TSchemaOrContent> =
	TSchemaOrContent extends StandardSchemaV1
		? { [TKey in DefaultBodyContentType]: TSchemaOrContent }
		: TSchemaOrContent;

// Each body appends its schemas to the media types it declares.
type AppendBody<TBody, TContent> = Merge<{
	[
		TMediaType in keyof TBody | keyof TContent
	]: TMediaType extends keyof TContent
		? TMediaType extends keyof TBody
			? TBody[TMediaType] extends readonly unknown[]
				? readonly [...TBody[TMediaType], TContent[TMediaType]]
				: never
			: readonly [TContent[TMediaType]]
		: TMediaType extends keyof TBody
			? TBody[TMediaType]
			: never;
}>;

export type WithBody<TState extends BuilderState, TSchemaOrContent> = NextState<
	TState,
	{
		omit: TState["omit"] | "get";
		request: Omit<TState["request"], "body"> & {
			body: AppendBody<
				TState["request"] extends { body: infer TBody } ? TBody : EmptyObject,
				ContentFor<TSchemaOrContent>
			>;
		};
	}
>;

export type WithMetadata<
	TState extends BuilderState,
	TMetadata extends RouteMetadata,
> = NextState<
	TState,
	{
		metadata: TState["metadata"] extends RouteMetadata
			? Merge<Omit<TState["metadata"], keyof TMetadata> & TMetadata>
			: TMetadata;
	}
>;

type StatusFor<TOptions> = TOptions extends {
	status: infer TStatus extends number;
}
	? TStatus
	: 200;

type ResponseHeadersFor<TOptions> = TOptions extends {
	headers: infer THeaders;
}
	? { headers: THeaders }
	: EmptyObject;

type ResponseFor<TSchemaOrContent, TOptions> = ([TSchemaOrContent] extends [
	undefined,
]
	? EmptyObject
	: { content: ContentFor<TSchemaOrContent> }) &
	ResponseHeadersFor<TOptions>;

export type WithResponse<
	TState extends BuilderState,
	TSchemaOrContent,
	TOptions,
> = NextState<
	TState,
	{
		responses: TState["responses"] &
			Record<StatusFor<TOptions>, ResponseFor<TSchemaOrContent, TOptions>>;
	}
>;
