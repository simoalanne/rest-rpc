import type { StandardSchemaV1 } from "../standard-schema/index.ts";
import type { BodyOptions } from "./body.ts";
import type {
	AbsolutePath,
	HttpMethod,
	OpenApiRouteOptions,
	RouteDeclaration,
	RouteMetadata,
	RouteRequestDeclaration,
} from "./routeDeclaration.ts";
import type {
	RequestHeadersSchema,
	RequestParamsSchema,
	RequestQuerySchema,
} from "./request.ts";
import type {
	BodylessResponseOptions,
	ResponseDeclaration,
	ResponseOptions,
	StreamResponseOptions,
} from "./response.ts";
import type {
	BuilderFor,
	BuilderKind,
	BuilderState,
	DeclarationFor,
	NextState,
	RootBuilderState,
	WithBody,
	WithHttpMethod,
	WithMetadata,
	WithRequest,
	WithResponse,
	WithStreamResponse,
} from "./routeBuilder.types.ts";

type RouteBuilderState = Partial<RouteDeclaration>;

const isStandardSchema = (value: unknown): value is StandardSchemaV1 =>
	(typeof value === "object" || typeof value === "function") &&
	value !== null &&
	"~standard" in value;

const appendSchema = <TSchema extends StandardSchemaV1>(
	schemas: readonly TSchema[] | undefined,
	schema: TSchema,
) => [...(schemas ?? []), schema];

const requestContentType = (
	state: RouteBuilderState,
	options: BodyOptions | undefined,
) => state.request?.contentType ?? options?.contentType ?? "application/json";

const assertHttpStatusCode = (status: number) => {
	if (!Number.isInteger(status) || status < 100 || status > 599) {
		throw new Error(`Invalid HTTP response status "${status}".`);
	}
};

const mergeUnique = (current: string[] = [], next: string[] = []) => [
	...new Set([...current, ...next]),
];

const mergeOpenApi = (
	current: OpenApiRouteOptions | undefined,
	next: OpenApiRouteOptions | undefined,
): OpenApiRouteOptions | undefined => {
	if (!current && !next) return undefined;
	return {
		...current,
		...next,
		tags: mergeUnique(current?.tags, next?.tags),
		extensions: { ...current?.extensions, ...next?.extensions },
	};
};

const defaultRouteState = (state: RouteBuilderState): RouteBuilderState => ({
	method: "POST",
	path: undefined,
	responses: {},
	...state,
});

const httpState = (
	state: RouteBuilderState,
	method: HttpMethod,
	path: AbsolutePath | undefined,
): RouteBuilderState => ({
	...state,
	method,
	path,
	responses: { ...state.responses },
});

const addRequestSegment = (
	state: RouteBuilderState,
	segment: "body" | "query" | "params",
	schema: StandardSchemaV1,
	request?: RouteRequestDeclaration,
): RouteBuilderState => ({
	...state,
	request: {
		...state.request,
		...request,
		[segment]: appendSchema(state.request?.[segment], schema),
	},
});

const addResponse = (
	state: RouteBuilderState,
	status: number,
	schema: ResponseDeclaration,
): RouteBuilderState => {
	assertHttpStatusCode(status);
	if (state.responses?.[status]) {
		throw new Error(`Response status "${status}" has already been declared.`);
	}
	return {
		...state,
		responses: { ...state.responses, [status]: schema },
	};
};

/** Builder kind of the core route builder. */
export interface RouteBuilderKind extends BuilderKind {
	readonly builder: this["state"] extends infer TState extends BuilderState
		? Omit<RouteBuilder<TState>, TState["omit"]>
		: never;
}

/**
 * Immutable fluent route builder.
 *
 * @remarks Every method returns a new builder typed by `TKind`, which lets
 * packages extending the builder keep their own builder type.
 */
export class RouteBuilder<
	TState extends BuilderState = RootBuilderState,
	TKind extends BuilderKind = RouteBuilderKind,
> {
	readonly "~restrpc": DeclarationFor<TState>;

	constructor(state: RouteBuilderState = {}) {
		this["~restrpc"] = { ...state } as DeclarationFor<TState>;
	}

	// Typed as `never` so each builder method returns its declared type.
	protected clone(state: RouteBuilderState): never {
		return new RouteBuilder(state) as never;
	}

	/** Declares a GET route. @see {@link https://rest-rpc.dev/docs/route-builder} */
	get<const TPath extends AbsolutePath | undefined = undefined>(
		path?: TPath,
	): BuilderFor<TKind, WithHttpMethod<TState, "GET", TPath>> {
		return this.clone(httpState(this["~restrpc"], "GET", path));
	}

	/** Declares a POST route. @see {@link https://rest-rpc.dev/docs/route-builder} */
	post<const TPath extends AbsolutePath | undefined = undefined>(
		path?: TPath,
	): BuilderFor<TKind, WithHttpMethod<TState, "POST", TPath>> {
		return this.clone(httpState(this["~restrpc"], "POST", path));
	}

	/** Declares a PUT route. @see {@link https://rest-rpc.dev/docs/route-builder} */
	put<const TPath extends AbsolutePath | undefined = undefined>(
		path?: TPath,
	): BuilderFor<TKind, WithHttpMethod<TState, "PUT", TPath>> {
		return this.clone(httpState(this["~restrpc"], "PUT", path));
	}

	/** Declares a PATCH route. @see {@link https://rest-rpc.dev/docs/route-builder} */
	patch<const TPath extends AbsolutePath | undefined = undefined>(
		path?: TPath,
	): BuilderFor<TKind, WithHttpMethod<TState, "PATCH", TPath>> {
		return this.clone(httpState(this["~restrpc"], "PATCH", path));
	}

	/** Declares a DELETE route. @see {@link https://rest-rpc.dev/docs/route-builder} */
	delete<const TPath extends AbsolutePath | undefined = undefined>(
		path?: TPath,
	): BuilderFor<TKind, WithHttpMethod<TState, "DELETE", TPath>> {
		return this.clone(httpState(this["~restrpc"], "DELETE", path));
	}

	/** Declares a request body and its HTTP metadata. @see {@link https://rest-rpc.dev/docs/route-builder#declare-request-segments} */
	body<
		const TSchema extends StandardSchemaV1,
		const TOptions extends BodyOptions | undefined = undefined,
	>(
		schema: TSchema,
		options?: TOptions,
	): BuilderFor<TKind, WithBody<TState, TSchema, TOptions>> {
		const state = defaultRouteState(this["~restrpc"]);
		return this.clone(
			addRequestSegment(state, "body", schema, {
				contentType: requestContentType(state, options),
			}),
		);
	}

	/** Declares request headers. @see {@link https://rest-rpc.dev/docs/route-builder#declare-request-segments} */
	headers<const TSchema extends RequestHeadersSchema>(
		schema: TSchema,
	): BuilderFor<TKind, WithRequest<TState, "headers", TSchema>> {
		const state = defaultRouteState(this["~restrpc"]);
		return this.clone({
			...state,
			request: {
				...state.request,
				headers: appendSchema(state.request?.headers, schema),
			},
		});
	}

	/** Declares URL query parameters. @see {@link https://rest-rpc.dev/docs/route-builder#declare-request-segments} */
	query<const TSchema extends RequestQuerySchema>(
		schema: TSchema,
	): BuilderFor<TKind, WithRequest<TState, "query", TSchema>> {
		return this.clone(
			addRequestSegment(defaultRouteState(this["~restrpc"]), "query", schema),
		);
	}

	/** Declares path parameters. @see {@link https://rest-rpc.dev/docs/route-builder#declare-request-segments} */
	params<const TSchema extends RequestParamsSchema>(
		schema: TSchema,
	): BuilderFor<TKind, WithRequest<TState, "params", TSchema>> {
		return this.clone(
			addRequestSegment(defaultRouteState(this["~restrpc"]), "params", schema),
		);
	}

	/** Adds application metadata, shallow-merged with earlier metadata. @see {@link https://rest-rpc.dev/docs/route-builder#add-metadata-and-openapi-details} */
	metadata<const TMetadata extends RouteMetadata>(
		metadata: TMetadata,
	): BuilderFor<TKind, WithMetadata<TState, TMetadata>> {
		const state = defaultRouteState(this["~restrpc"]);
		return this.clone({
			...state,
			metadata: { ...state.metadata, ...metadata },
		});
	}

	/** Adds OpenAPI metadata, merged with earlier details. @see {@link https://rest-rpc.dev/docs/openapi#route-metadata} */
	openAPI(
		openApi: OpenApiRouteOptions,
	): BuilderFor<TKind, NextState<TState, { openApi: true }>> {
		const state = defaultRouteState(this["~restrpc"]);
		return this.clone({
			...state,
			openApi: mergeOpenApi(state.openApi, openApi),
		});
	}

	/** Declares a response schema and HTTP metadata. The status defaults to 200. @see {@link https://rest-rpc.dev/docs/route-builder#declare-responses} */
	response<
		const TSchema extends StandardSchemaV1,
		const TOptions extends ResponseOptions | undefined = undefined,
	>(
		schema: TSchema,
		options?: TOptions,
	): BuilderFor<TKind, WithResponse<TState, TSchema, TOptions>>;
	/** Declares a response without a body. The status defaults to 200. @see {@link https://rest-rpc.dev/docs/route-builder#declare-responses} */
	response<
		const TOptions extends BodylessResponseOptions | undefined = undefined,
	>(
		options?: TOptions,
	): BuilderFor<TKind, WithResponse<TState, undefined, TOptions>>;
	response(
		schemaOrOptions?: StandardSchemaV1 | BodylessResponseOptions,
		options?: ResponseOptions,
	): never {
		const state = defaultRouteState(this["~restrpc"]);
		if (!isStandardSchema(schemaOrOptions)) {
			const { status = 200, headers, description } = schemaOrOptions ?? {};
			return this.clone(
				addResponse(state, status, { body: undefined, headers, description }),
			);
		}
		const { status = 200, ...declaration } = options ?? {};
		return this.clone(
			addResponse(state, status, {
				...declaration,
				body: schemaOrOptions,
				contentType: declaration.contentType ?? "application/json",
			}),
		);
	}

	/** Declares a streaming response. The status defaults to 200. @see {@link https://rest-rpc.dev/docs/streaming} */
	streamResponse<
		const TSchema extends StandardSchemaV1,
		const TOptions extends StreamResponseOptions | undefined = undefined,
	>(
		schema: TSchema,
		options?: TOptions,
	): BuilderFor<TKind, WithStreamResponse<TState, TSchema, TOptions>> {
		const state = defaultRouteState(this["~restrpc"]);
		return this.clone(
			addResponse(state, options?.status ?? 200, {
				kind: "stream",
				body: schema,
				headers: options?.headers,
				description: options?.description,
			}),
		);
	}
}

/**
 * Entry point for declaring contract-first routes.
 *
 * @remarks Every builder method returns a new route value, so partially built
 * routes can be reused safely across declarations.
 *
 * @see {@link https://rest-rpc.dev/docs/route-builder}
 */
export const route = new RouteBuilder();
