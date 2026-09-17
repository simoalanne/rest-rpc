import type { StandardSchemaV1 } from "../standard-schema/index.ts";
import type { BodyOptions } from "./body.ts";
import type {
	CommonOpenApiRouteOptions,
	HttpMethod,
	OpenApiResponseOptions,
	OpenApiRouteOptions,
	RouteDeclaration,
	RouteMetadata,
} from "./routeDeclaration.ts";
import { getPathParamNames } from "./path.ts";
import type {
	RequestHeadersSchema,
	RequestParamsSchema,
	RequestQuerySchema,
} from "./request.ts";
import type { ResponseDeclaration, ResponseOptions } from "./response.ts";
import type { RootRouteBuilder } from "./routeBuilder.types.ts";

type RouteBuilderState = Partial<RouteDeclaration>;

const assertMutable = (state: RouteBuilderState) => {
	if ("handler" in state) {
		throw new Error("Cannot change a route after attaching a handler.");
	}
};

const assertInputMode = (
	state: RouteBuilderState,
	mode: "input" | "segments",
) => {
	if (state.input && state.input !== mode) {
		throw new Error("Cannot combine flat input with request segments.");
	}
};

const assertOutputMode = (
	state: RouteBuilderState,
	mode: "output" | "response",
) => {
	if (state.output && state.output !== mode) {
		throw new Error("Cannot combine plain output with response envelopes.");
	}
};

const assertUnusedSegment = (
	state: RouteBuilderState,
	segment: "body" | "query" | "params" | "headers",
) => {
	assertInputMode(state, "segments");
	if (state.request?.[segment]) {
		throw new Error(`Request ${segment} has already been declared.`);
	}
};

const assertHttpStatusCode = (status: number) => {
	if (!Number.isInteger(status) || status < 100 || status > 599) {
		throw new Error(`Invalid HTTP response status "${status}".`);
	}
};

const mergeUnique = (common: string[] = [], local: string[] = []) => [
	...new Set([...common, ...local]),
];

const mergeOpenApiResponse = (
	common: OpenApiResponseOptions | undefined,
	local: OpenApiResponseOptions | undefined,
): OpenApiResponseOptions => ({
	...common,
	...local,
	headers: { ...common?.headers, ...local?.headers },
});

const mergeOpenApi = (
	common: CommonOpenApiRouteOptions | undefined,
	local: OpenApiRouteOptions | undefined,
): OpenApiRouteOptions | undefined => {
	if (!common && !local) return undefined;
	const statuses = new Set([
		...Object.keys(common?.responses ?? {}),
		...Object.keys(local?.responses ?? {}),
	]);

	return {
		...common,
		...local,
		tags: mergeUnique(common?.tags, local?.tags),
		extensions: { ...common?.extensions, ...local?.extensions },
		responses: Object.fromEntries(
			[...statuses].map((status) => [
				status,
				mergeOpenApiResponse(
					common?.responses?.[Number(status)],
					local?.responses?.[Number(status)],
				),
			]),
		),
	};
};

const procedureState = (state: RouteBuilderState): RouteBuilderState => {
	assertMutable(state);
	return {
		kind: "procedure",
		method: "POST",
		path: "",
		responses: {},
		...state,
	};
};

const httpState = (
	state: RouteBuilderState,
	method: HttpMethod,
	path: string,
): RouteBuilderState => {
	assertMutable(state);
	if (state.kind === "http" || state.input || state.output) {
		throw new Error("Route method and path have already been selected.");
	}
	return {
		...state,
		kind: "http",
		method,
		path,
		responses: { ...state.responses },
		request: state.request,
	};
};

const addResponse = (
	state: RouteBuilderState,
	status: number,
	schema: ResponseDeclaration,
): RouteBuilder => {
	assertHttpStatusCode(status);
	if (Object.hasOwn(state.responses ?? {}, status)) {
		throw new Error(`Response status "${status}" has already been declared.`);
	}
	return new RouteBuilder({
		...state,
		responses: { ...state.responses, [status]: schema },
	});
};

/** Immutable runtime implementation used by every route-builder stage. */
export class RouteBuilder {
	readonly "~restrpc": RouteBuilderState;

	constructor(state: RouteBuilderState = {}) {
		this["~restrpc"] = { ...state };
	}

	get(path: string): RouteBuilder {
		return new RouteBuilder(httpState(this["~restrpc"], "GET", path));
	}

	post(path: string): RouteBuilder {
		return new RouteBuilder(httpState(this["~restrpc"], "POST", path));
	}

	put(path: string): RouteBuilder {
		return new RouteBuilder(httpState(this["~restrpc"], "PUT", path));
	}

	patch(path: string): RouteBuilder {
		return new RouteBuilder(httpState(this["~restrpc"], "PATCH", path));
	}

	delete(path: string): RouteBuilder {
		return new RouteBuilder(httpState(this["~restrpc"], "DELETE", path));
	}

	body(schema: StandardSchemaV1, options?: BodyOptions): RouteBuilder {
		const state = procedureState(this["~restrpc"]);
		if (state.method === "GET") {
			throw new Error("GET routes cannot declare a request body.");
		}
		assertUnusedSegment(state, "body");
		return new RouteBuilder({
			...state,
			input: "segments",
			request: {
				...state.request,
				body: schema,
				contentType: options?.contentType ?? "application/json",
			},
		});
	}

	input(schema: StandardSchemaV1, options?: BodyOptions): RouteBuilder {
		const state = procedureState(this["~restrpc"]);
		if (state.method === "GET" && options !== undefined) {
			throw new Error("GET flat input cannot declare a body content type.");
		}
		assertInputMode(state, "input");
		if (state.input === "input") {
			throw new Error("Flat input has already been declared.");
		}
		if (getPathParamNames(state.path ?? "").length > 0) {
			throw new Error("Flat input requires a static route path.");
		}
		return new RouteBuilder({
			...state,
			input: "input",
			request: {
				...state.request,
				...(state.method === "GET"
					? { query: schema as RequestQuerySchema }
					: {
							body: schema,
							contentType: options?.contentType ?? "application/json",
						}),
			},
		});
	}

	headers(schema: RequestHeadersSchema): RouteBuilder {
		const state = procedureState(this["~restrpc"]);
		assertUnusedSegment(state, "headers");
		return new RouteBuilder({
			...state,
			input: "segments",
			request: {
				...state.request,
				headers: { ...state.request?.headers, local: schema },
			},
		});
	}

	query(schema: RequestQuerySchema): RouteBuilder {
		const state = procedureState(this["~restrpc"]);
		assertUnusedSegment(state, "query");
		return new RouteBuilder({
			...state,
			input: "segments",
			request: { ...state.request, query: schema },
		});
	}

	params(schema: RequestParamsSchema): RouteBuilder {
		const state = procedureState(this["~restrpc"]);
		assertUnusedSegment(state, "params");
		return new RouteBuilder({
			...state,
			input: "segments",
			request: { ...state.request, params: schema },
		});
	}

	metadata(metadata: RouteMetadata): RouteBuilder {
		const state = procedureState(this["~restrpc"]);
		return new RouteBuilder({
			...state,
			metadata: { ...state.metadata, ...metadata },
		});
	}

	openAPI(openApi: OpenApiRouteOptions): RouteBuilder {
		const state = procedureState(this["~restrpc"]);
		return new RouteBuilder({
			...state,
			openApi: mergeOpenApi(state.openApi, openApi),
		});
	}

	response(
		status: number,
		schema?: StandardSchemaV1,
		options?: ResponseOptions,
	): RouteBuilder {
		const state = procedureState(this["~restrpc"]);
		assertOutputMode(state, "response");
		return addResponse(
			{ ...state, output: "response" },
			status,
			schema
				? {
						...options,
						body: schema,
						contentType: options?.contentType ?? "application/json",
					}
				: {
						body: undefined,
						...(options?.headers ? { headers: options.headers } : {}),
					},
		);
	}

	output(schema: StandardSchemaV1, options?: BodyOptions): RouteBuilder {
		const state = procedureState(this["~restrpc"]);
		assertOutputMode(state, "output");
		return addResponse({ ...state, output: "output" }, 200, {
			body: schema,
			contentType: options?.contentType ?? "application/json",
		});
	}

	streamOutput(schema: StandardSchemaV1): RouteBuilder {
		const state = procedureState(this["~restrpc"]);
		assertOutputMode(state, "output");
		return addResponse({ ...state, output: "output" }, 200, {
			kind: "stream",
			body: schema,
		});
	}

	streamResponse(status: number, schema: StandardSchemaV1): RouteBuilder {
		const state = procedureState(this["~restrpc"]);
		assertOutputMode(state, "response");
		return addResponse({ ...state, output: "response" }, status, {
			kind: "stream",
			body: schema,
		});
	}
}

const runtimeRoute = new RouteBuilder({ path: "" });

/**
 * Entry point for declaring contract-first routes with independent input and output forms.
 *
 * @remarks Every builder method returns a new route value, so partially built
 * routes can be reused safely across declarations.
 *
 * @see {@link https://rest-rpc.dev/docs/route-builder}
 */
export const route = runtimeRoute as unknown as RootRouteBuilder;
