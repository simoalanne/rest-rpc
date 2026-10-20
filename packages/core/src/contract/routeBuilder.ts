import type { StandardSchemaV1 } from "../standard-schema/index.ts";
import type { BodyContent } from "./body.ts";
import type {
	AbsolutePath,
	HttpMethod,
	OpenApiRouteOptions,
	RouteDeclaration,
	RouteMetadata,
} from "./routeDeclaration.ts";
import type {
	RequestHeadersSchema,
	RequestParamsSchema,
	RequestQuerySchema,
} from "./request.ts";
import type {
	ResponseContentDeclaration,
	ResponseDeclaration,
	ResponseOptions,
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

// Generic constraints skip excess property checks, so keys that are not media
// types are rejected explicitly. This sends response options to their overload.
type MediaTypeKeysOnly<TContent> = TContent & {
	[TKey in Exclude<keyof TContent, `${string}/${string}`>]: never;
};

const isStandardSchema = (value: unknown): value is StandardSchemaV1 =>
	(typeof value === "object" || typeof value === "function") &&
	value !== null &&
	"~standard" in value;

const appendSchema = <TSchema extends StandardSchemaV1>(
	schemas: readonly TSchema[] | undefined,
	schema: TSchema,
) => [...(schemas ?? []), schema];

// The first `.response()` argument is a schema, a content record, or options.
// Media type keys contain a slash and option keys never do, so any slash marks
// a content record. Its keys are validated separately.
const isBodyContent = (value: unknown): value is BodyContent =>
	typeof value === "object" &&
	value !== null &&
	Object.keys(value).some((key) => key.includes("/"));

// Keys are matched against normalized received media types as-is.
const assertMediaTypes = (content: object) => {
	for (const mediaType of Object.keys(content)) {
		if (
			!mediaType.includes("/") ||
			mediaType !== mediaType.toLowerCase() ||
			mediaType.includes(";")
		) {
			throw new Error(
				`Media type "${mediaType}" must be a lowercase base media type such as "application/json".`,
			);
		}
	}
};

const toContent = (
	schemaOrContent: StandardSchemaV1 | BodyContent,
): ResponseContentDeclaration => {
	if (isStandardSchema(schemaOrContent)) {
		return { "application/json": schemaOrContent };
	}
	assertMediaTypes(schemaOrContent);
	return schemaOrContent as ResponseContentDeclaration;
};

const appendBody = (
	state: RouteBuilderState,
	content: ResponseContentDeclaration,
): RouteBuilderState => {
	const body = { ...state.request?.body };
	for (const [mediaType, schema] of Object.entries(content)) {
		body[mediaType] = appendSchema(body[mediaType], schema);
	}
	return { ...state, request: { ...state.request, body } };
};

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
	segment: "query" | "params",
	schema: StandardSchemaV1,
): RouteBuilderState => ({
	...state,
	request: {
		...state.request,
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

	/** Declares a GET route. @see {@link https://rest-rpc.vercel.app/docs/route-builder} */
	get<const TPath extends AbsolutePath | undefined = undefined>(
		path?: TPath,
	): BuilderFor<TKind, WithHttpMethod<TState, "GET", TPath>> {
		return this.clone(httpState(this["~restrpc"], "GET", path));
	}

	/** Declares a POST route. @see {@link https://rest-rpc.vercel.app/docs/route-builder} */
	post<const TPath extends AbsolutePath | undefined = undefined>(
		path?: TPath,
	): BuilderFor<TKind, WithHttpMethod<TState, "POST", TPath>> {
		return this.clone(httpState(this["~restrpc"], "POST", path));
	}

	/** Declares a PUT route. @see {@link https://rest-rpc.vercel.app/docs/route-builder} */
	put<const TPath extends AbsolutePath | undefined = undefined>(
		path?: TPath,
	): BuilderFor<TKind, WithHttpMethod<TState, "PUT", TPath>> {
		return this.clone(httpState(this["~restrpc"], "PUT", path));
	}

	/** Declares a PATCH route. @see {@link https://rest-rpc.vercel.app/docs/route-builder} */
	patch<const TPath extends AbsolutePath | undefined = undefined>(
		path?: TPath,
	): BuilderFor<TKind, WithHttpMethod<TState, "PATCH", TPath>> {
		return this.clone(httpState(this["~restrpc"], "PATCH", path));
	}

	/** Declares a DELETE route. @see {@link https://rest-rpc.vercel.app/docs/route-builder} */
	delete<const TPath extends AbsolutePath | undefined = undefined>(
		path?: TPath,
	): BuilderFor<TKind, WithHttpMethod<TState, "DELETE", TPath>> {
		return this.clone(httpState(this["~restrpc"], "DELETE", path));
	}

	/** Declares a JSON request body. @see {@link https://rest-rpc.vercel.app/docs/route-builder#declare-request-segments} */
	body<const TSchema extends StandardSchemaV1>(
		schema: TSchema,
	): BuilderFor<TKind, WithBody<TState, TSchema>>;
	/** Declares request body schemas keyed by media type. @see {@link https://rest-rpc.vercel.app/docs/route-builder#declare-request-segments} */
	body<const TContent extends BodyContent>(
		content: MediaTypeKeysOnly<TContent>,
	): BuilderFor<TKind, WithBody<TState, TContent>>;
	body(schemaOrContent: StandardSchemaV1 | BodyContent): never {
		return this.clone(
			appendBody(
				defaultRouteState(this["~restrpc"]),
				toContent(schemaOrContent),
			),
		);
	}

	/** Declares request headers. @see {@link https://rest-rpc.vercel.app/docs/route-builder#declare-request-segments} */
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

	/** Declares URL query parameters. @see {@link https://rest-rpc.vercel.app/docs/route-builder#declare-request-segments} */
	query<const TSchema extends RequestQuerySchema>(
		schema: TSchema,
	): BuilderFor<TKind, WithRequest<TState, "query", TSchema>> {
		return this.clone(
			addRequestSegment(defaultRouteState(this["~restrpc"]), "query", schema),
		);
	}

	/** Declares path parameters. @see {@link https://rest-rpc.vercel.app/docs/route-builder#declare-request-segments} */
	params<const TSchema extends RequestParamsSchema>(
		schema: TSchema,
	): BuilderFor<TKind, WithRequest<TState, "params", TSchema>> {
		return this.clone(
			addRequestSegment(defaultRouteState(this["~restrpc"]), "params", schema),
		);
	}

	/** Adds application metadata, shallow-merged with earlier metadata. @see {@link https://rest-rpc.vercel.app/docs/route-builder#add-metadata-and-openapi-details} */
	metadata<const TMetadata extends RouteMetadata>(
		metadata: TMetadata,
	): BuilderFor<TKind, WithMetadata<TState, TMetadata>> {
		const state = defaultRouteState(this["~restrpc"]);
		return this.clone({
			...state,
			metadata: { ...state.metadata, ...metadata },
		});
	}

	/** Adds OpenAPI metadata, merged with earlier details. @see {@link https://rest-rpc.vercel.app/docs/openapi#route-metadata} */
	openAPI(
		openApi: OpenApiRouteOptions,
	): BuilderFor<TKind, NextState<TState, { openApi: true }>> {
		const state = defaultRouteState(this["~restrpc"]);
		return this.clone({
			...state,
			openApi: mergeOpenApi(state.openApi, openApi),
		});
	}

	/** Declares a JSON response. The status defaults to 200. @see {@link https://rest-rpc.vercel.app/docs/route-builder#declare-responses} */
	response<
		const TSchema extends StandardSchemaV1,
		const TOptions extends ResponseOptions | undefined = undefined,
	>(
		schema: TSchema,
		options?: TOptions,
	): BuilderFor<TKind, WithResponse<TState, TSchema, TOptions>>;
	/** Declares response schemas keyed by media type. The status defaults to 200. @see {@link https://rest-rpc.vercel.app/docs/route-builder#declare-responses} */
	response<
		const TContent extends BodyContent,
		const TOptions extends ResponseOptions | undefined = undefined,
	>(
		content: MediaTypeKeysOnly<TContent>,
		options?: TOptions,
	): BuilderFor<TKind, WithResponse<TState, TContent, TOptions>>;
	/** Declares a response without a body. The status defaults to 200. @see {@link https://rest-rpc.vercel.app/docs/route-builder#declare-responses} */
	response<const TOptions extends ResponseOptions | undefined = undefined>(
		options?: TOptions,
	): BuilderFor<TKind, WithResponse<TState, undefined, TOptions>>;
	response(
		schemaOrContentOrOptions?: StandardSchemaV1 | BodyContent | ResponseOptions,
		options?: ResponseOptions,
	): never {
		const state = defaultRouteState(this["~restrpc"]);
		if (
			!isStandardSchema(schemaOrContentOrOptions) &&
			!isBodyContent(schemaOrContentOrOptions)
		) {
			const { status = 200, ...declaration } = schemaOrContentOrOptions ?? {};
			return this.clone(addResponse(state, status, declaration));
		}
		const { status = 200, ...declaration } = options ?? {};
		return this.clone(
			addResponse(state, status, {
				...declaration,
				content: toContent(schemaOrContentOrOptions),
			}),
		);
	}

	/** Declares a streaming response. The status defaults to 200. @see {@link https://rest-rpc.vercel.app/docs/streaming} */
	streamResponse<
		const TSchema extends StandardSchemaV1,
		const TOptions extends ResponseOptions | undefined = undefined,
	>(
		schema: TSchema,
		options?: TOptions,
	): BuilderFor<TKind, WithStreamResponse<TState, TSchema, TOptions>> {
		const state = defaultRouteState(this["~restrpc"]);
		return this.clone(
			addResponse(state, options?.status ?? 200, {
				kind: "stream",
				content: { "text/event-stream": schema },
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
 * @see {@link https://rest-rpc.vercel.app/docs/route-builder}
 */
export const route = new RouteBuilder();
