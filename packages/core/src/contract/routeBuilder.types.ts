import type { RouteErrorDefinition } from "./routeError.ts";
import type { RawResponses } from "./raw.ts";
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

export type WithBody<TState extends BuilderState, TSchema> = NextState<
	TState,
	{
		omit: TState["omit"] | "get";
		request: Omit<TState["request"], "body"> & {
			body: TState["request"] extends {
				body: infer TBody extends readonly unknown[];
			}
				? readonly [...TBody, TSchema]
				: readonly [TSchema];
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

type ResponseHeadersOption<TOptions> = TOptions extends {
	headers: infer THeaders;
}
	? { headers: THeaders }
	: EmptyObject;

/** The body of a defined response: `{ body }`, `{ sse }`, or none. */
export type WithResponse<
	TState extends BuilderState,
	TBody extends object,
	TOptions,
> = NextState<
	TState,
	{
		responses: TState["responses"] &
			Record<StatusFor<TOptions>, TBody & ResponseHeadersOption<TOptions>>;
	}
>;

export type WithRawResponse<TState extends BuilderState> = NextState<
	TState,
	{ responses: RawResponses }
>;

/** Rejects `raw()` on a route that already defines responses. */
export type RawResponseCheck<TState extends BuilderState> =
	keyof TState["responses"] extends never
		? unknown
		: { "~error": "raw() must be a route's only response." };

/** Rejects other responses on a route defined with `raw()`. */
export type AfterRawResponseCheck<TState extends BuilderState> =
	number extends keyof TState["responses"]
		? { "~error": "raw() must be a route's only response." }
		: unknown;

/** Rejects a response for a status the route already defines. */
export type NewStatusCheck<TState extends BuilderState, TOptions> =
	StatusFor<TOptions> extends keyof TState["responses"]
		? { "~error": "The route already defines a response for this status." }
		: true extends IsNonSuccessStatus<StatusFor<TOptions>>
			? {
					"~error": "Response statuses are from 200 to 299. Define errors with .error(), and redirects and other statuses with .response(raw()).";
				}
			: unknown;

type Digit = "0" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9";

/**
 * Whether a status literal is outside 200 to 299, for each member of a union.
 * A widened `number` is checked at runtime instead.
 */
export type IsNonSuccessStatus<TStatus extends number> = number extends TStatus
	? false
	: TStatus extends unknown
		? `${TStatus}` extends `2${Digit}${Digit}`
			? false
			: true
		: never;

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
