import type { StandardSchemaV1 } from "../standard-schema/index.ts";
import type { RouteErrorDefinition } from "./routeError.ts";
import type { DefaultBodyContentType } from "./body.ts";
import type {
	AbsolutePath,
	DefaultMeta,
	HttpMethod,
	OpenApiRouteOptions,
	RouteErrors,
	RouteMeta,
	RouteRequestDefinition,
} from "./routeDefinition.ts";
import type { EmptyObject, Merge } from "../utils/typeUtils.ts";

/** `omit` lists the builder methods that are no longer available. */
export type BuilderState = {
	method: HttpMethod | undefined;
	path: AbsolutePath | undefined;
	prefix: AbsolutePath | undefined;
	request: object;
	responses: object;
	errors: RouteErrors;
	meta: RouteMeta | undefined;
	/** The shape declared with `$meta()` and `DefaultMeta`, which `.meta()` values must match. */
	metaShape: object;
	openApi: boolean;
	omit: PropertyKey;
};

export type RootBuilderState = {
	method: undefined;
	path: undefined;
	prefix: undefined;
	request: EmptyObject;
	responses: EmptyObject;
	errors: EmptyObject;
	meta: undefined;
	metaShape: DefaultMeta;
	openApi: false;
	omit: never;
};

/** Leaving the root without choosing a method selects `POST`, matching the runtime default. */
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

/** The builder methods a state leaves out. `.meta()` needs a declared metadata shape. */
export type OmittedMethods<TState extends BuilderState> =
	| TState["omit"]
	| (keyof TState["metaShape"] extends never ? "meta" : never);

/** Maps a builder state to a builder type, so packages extending the builder get their own type back. */
export interface BuilderKind {
	// `unknown` so applying a kind does not intersect the state with `BuilderState`.
	readonly state: unknown;
	readonly builder: unknown;
}

export type BuilderFor<
	TKind extends BuilderKind,
	TState extends BuilderState,
> = (TKind & { readonly state: TState })["builder"];

export type DefinitionFor<TState extends BuilderState> =
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
					} & (keyof TState["errors"] extends never
						? EmptyObject
						: { errors: TState["errors"] }) &
					(TState["meta"] extends RouteMeta
						? { readonly meta: TState["meta"] }
						: EmptyObject) & {
						readonly metaShape?: TState["metaShape"];
					} & (TState["prefix"] extends AbsolutePath
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

// GET routes cannot define a body, so `get` and `body` exclude each other. A
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
	TKey extends keyof RouteRequestDefinition,
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

// Each body appends its schemas to the media types it defines.
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

export type WithMeta<
	TState extends BuilderState,
	TMeta extends RouteMeta,
> = NextState<
	TState,
	{
		meta: TState["meta"] extends RouteMeta
			? Merge<Omit<TState["meta"], keyof TMeta> & TMeta>
			: TMeta;
	}
>;

// Types from the new shape win for keys already in it, as with `$context()`.
export type WithMetaShape<
	TState extends BuilderState,
	TShape extends object,
> = NextState<
	TState,
	{ metaShape: Merge<Omit<TState["metaShape"], keyof TShape> & TShape> }
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

export type WithError<
	TState extends BuilderState,
	TDefinition extends RouteErrorDefinition,
> = NextState<
	TState,
	{
		errors: Merge<
			Omit<TState["errors"], TDefinition["code"]> &
				Record<TDefinition["code"], TDefinition>
		>;
	}
>;
