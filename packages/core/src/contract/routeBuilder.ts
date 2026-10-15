import type { StandardSchemaV1 } from "../standard-schema/index.ts";
import type { BodyOptions } from "./body.ts";
import type {
	AbsolutePath,
	CommonOpenApiRouteOptions,
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
import type { PublicRouteBuilder } from "./routeBuilder.types.ts";

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

const mergeUnique = (common: string[] = [], local: string[] = []) => [
	...new Set([...common, ...local]),
];

const mergeOpenApi = (
	common: CommonOpenApiRouteOptions | undefined,
	local: OpenApiRouteOptions | undefined,
): OpenApiRouteOptions | undefined => {
	if (!common && !local) return undefined;
	return {
		...common,
		...local,
		tags: mergeUnique(common?.tags, local?.tags),
		extensions: { ...common?.extensions, ...local?.extensions },
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
): RouteBuilderState => {
	if (method === "GET" && state.request?.body) {
		throw new Error("GET routes cannot declare a request body.");
	}
	return {
		...state,
		method,
		path,
		responses: { ...state.responses },
	};
};

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

const withDescription = (options: { description?: string } | undefined) =>
	options?.description === undefined
		? {}
		: { description: options.description };

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

/** Immutable runtime implementation used by every route-builder stage. */
export class RouteBuilder {
	readonly "~restrpc": RouteBuilderState;

	constructor(state: RouteBuilderState = {}) {
		this["~restrpc"] = { ...state };
	}

	clone(state: RouteBuilderState): RouteBuilder {
		return new RouteBuilder(state);
	}

	get(path?: AbsolutePath): RouteBuilder {
		return this.clone(httpState(this["~restrpc"], "GET", path));
	}

	post(path?: AbsolutePath): RouteBuilder {
		return this.clone(httpState(this["~restrpc"], "POST", path));
	}

	put(path?: AbsolutePath): RouteBuilder {
		return this.clone(httpState(this["~restrpc"], "PUT", path));
	}

	patch(path?: AbsolutePath): RouteBuilder {
		return this.clone(httpState(this["~restrpc"], "PATCH", path));
	}

	delete(path?: AbsolutePath): RouteBuilder {
		return this.clone(httpState(this["~restrpc"], "DELETE", path));
	}

	body(schema: StandardSchemaV1, options?: BodyOptions): RouteBuilder {
		const state = defaultRouteState(this["~restrpc"]);
		if (state.method === "GET") {
			throw new Error("GET routes cannot declare a request body.");
		}
		return this.clone(
			addRequestSegment(state, "body", schema, {
				contentType: requestContentType(state, options),
			}),
		);
	}

	headers(schema: RequestHeadersSchema): RouteBuilder {
		const state = defaultRouteState(this["~restrpc"]);
		return this.clone({
			...state,
			request: {
				...state.request,
				headers: appendSchema(state.request?.headers, schema),
			},
		});
	}

	query(schema: RequestQuerySchema): RouteBuilder {
		return this.clone(
			addRequestSegment(defaultRouteState(this["~restrpc"]), "query", schema),
		);
	}

	params(schema: RequestParamsSchema): RouteBuilder {
		return this.clone(
			addRequestSegment(defaultRouteState(this["~restrpc"]), "params", schema),
		);
	}

	metadata(metadata: RouteMetadata): RouteBuilder {
		const state = defaultRouteState(this["~restrpc"]);
		return this.clone({
			...state,
			metadata: { ...state.metadata, ...metadata },
		});
	}

	openAPI(openApi: OpenApiRouteOptions): RouteBuilder {
		const state = defaultRouteState(this["~restrpc"]);
		return this.clone({
			...state,
			openApi: mergeOpenApi(state.openApi, openApi),
		});
	}

	response(
		schemaOrOptions?: StandardSchemaV1 | BodylessResponseOptions,
		options?: ResponseOptions,
	): RouteBuilder {
		const state = defaultRouteState(this["~restrpc"]);
		if (!isStandardSchema(schemaOrOptions)) {
			const { status = 200, headers } = schemaOrOptions ?? {};
			return this.clone(
				addResponse(state, status, {
					body: undefined,
					...(headers ? { headers } : {}),
					...withDescription(schemaOrOptions),
				}),
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

	streamResponse(
		schema: StandardSchemaV1,
		options?: StreamResponseOptions,
	): RouteBuilder {
		const state = defaultRouteState(this["~restrpc"]);
		return this.clone(
			addResponse(state, options?.status ?? 200, {
				kind: "stream",
				body: schema,
				...(options?.headers ? { headers: options.headers } : {}),
				...withDescription(options),
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
export const route = new RouteBuilder({
	path: undefined,
}) as unknown as PublicRouteBuilder;
