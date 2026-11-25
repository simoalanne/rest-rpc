import {
	isDefinedError,
	RouteError,
	type CreateOpenApiDocumentOptions,
} from "@rest-rpc/core";
import {
	contentTypesOf,
	contractRouteEntries,
	getPathParamNames,
	type DefaultMeta,
	type RouteDefinition,
} from "@rest-rpc/core/contract";
import type { StandardSchemaV1 } from "@rest-rpc/core/standard-schema";
import type { EmptyObject } from "@rest-rpc/core/utils";
import { call } from "../pipeline/call.ts";
import { InternalServerError } from "../pipeline/errors.ts";
import type { ContextOption, OptionsArgs } from "../pipeline/handleOptions.ts";
import type {
	ImplementedRoute,
	RuntimeImplementationTree,
	TreeInitialContext,
} from "../routing/match.ts";

/** A JSON Schema object. */
export type JsonSchema = Record<string, unknown>;

/** A JSON value. */
export type JsonValue =
	| string
	| number
	| boolean
	| null
	| JsonValue[]
	| { [key: string]: JsonValue };

/**
 * Hints about a tool's behavior, the `annotations` of an MCP tool.
 *
 * @see {@link https://rest-rpc.vercel.app/docs/tooling/mcp-tools#tools}
 */
export type ToolAnnotations = {
	/** A human-readable title of the tool. */
	title?: string;
	/** The tool does not modify its environment. */
	readOnlyHint?: boolean;
	/** The tool may perform destructive updates. Meaningful only when `readOnlyHint` is `false`. */
	destructiveHint?: boolean;
	/** Calling the tool again with the same arguments has no additional effect. */
	idempotentHint?: boolean;
	/** The tool interacts with an open world of external entities. */
	openWorldHint?: boolean;
};

/**
 * A tool definition, shaped like the MCP `Tool` of protocol revision
 * 2026-07-28.
 *
 * @see {@link https://rest-rpc.vercel.app/docs/tooling/mcp-tools#tools}
 */
export type ToolDefinition = {
	/** The name the model calls the tool by. */
	name: string;
	/** A human-readable title. */
	title?: string;
	/** What the tool does, which models read to choose a tool. */
	description?: string;
	/** The JSON Schema of the arguments, an object. */
	inputSchema: JsonSchema & { type: "object" };
	/** The JSON Schema of a successful result's `structuredContent`, the body of the route's only defined response. */
	outputSchema?: JsonSchema;
	/** Hints about the tool's behavior. */
	annotations?: ToolAnnotations;
};

/**
 * The result of a tool call, shaped like the MCP `CallToolResult` of protocol
 * revision 2026-07-28.
 *
 * @see {@link https://rest-rpc.vercel.app/docs/tooling/mcp-tools#results}
 */
export type ToolResult = {
	/** The body as text: a string as it is, and other values as JSON. The error as JSON when `isError` is set. Empty when there is no body. */
	content: Array<{ type: "text"; text: string }>;
	/** The body as JSON. */
	structuredContent?: JsonValue;
	/** Set when the call failed, with the error as JSON in `content`. */
	isError?: boolean;
};

/**
 * Options of a tool call. `context` is required when the routes require
 * initial context.
 *
 * @see {@link https://rest-rpc.vercel.app/docs/tooling/mcp-tools#serve-over-mcp}
 */
export type ToolCallOptions<TContext extends object = EmptyObject> =
	ContextOption<TContext> & {
		/** Aborts the call. */
		signal?: AbortSignal;
		/**
		 * Request headers provided by the host, such as `authorization`, which
		 * replace headers of the same name in the arguments.
		 */
		headers?: Record<string, string>;
	};

/**
 * A tool: its definition and a function that calls it.
 *
 * @see {@link https://rest-rpc.vercel.app/docs/tooling/mcp-tools}
 */
export type AgentTool<TContext extends object = EmptyObject> = {
	/** The tool definition, as registered with an MCP server or agent SDK. */
	definition: ToolDefinition;
	/**
	 * Calls the tool with the arguments a model sent, and resolves with the
	 * result. Errors resolve as results with `isError` instead of rejecting.
	 */
	call: (
		args: Record<string, unknown>,
		...options: OptionsArgs<TContext, ToolCallOptions<TContext>>
	) => Promise<ToolResult>;
};

/**
 * Options of `createToolsFromRoutes()`.
 *
 * @see {@link https://rest-rpc.vercel.app/docs/tooling/mcp-tools#options}
 */
export type CreateToolsFromRoutesOptions = {
	/**
	 * Converts Standard Schema definitions into JSON Schema.
	 * Without it, or when it returns `undefined`, a segment
	 * accepts any value.
	 */
	schemaConverter?: CreateOpenApiDocumentOptions["schemaConverter"];
	/**
	 * Called with each error a tool call returns, as the `RouteError` the model
	 * receives. An error that isn't a `RouteError` is sent as
	 * `INTERNAL_SERVER_ERROR`, with the thrown value as its `cause`, and the
	 * model receives none of it.
	 */
	onError?: (error: RouteError) => void;
};

type Converter = NonNullable<CreateToolsFromRoutesOptions["schemaConverter"]>;

const isObject = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null && !Array.isArray(value);

// Hosts accept tool names of letters, digits, `_` and `-`.
const toToolName = (routePath: readonly string[]) =>
	routePath.join("_").replace(/[^A-Za-z0-9_-]/g, "_");

// Like OpenAPI, the converter's output is used as it is, and a segment's
// stacked schemas are all of them.
const allOf = (schemas: readonly JsonSchema[]): JsonSchema =>
	schemas.length === 1 ? schemas[0]! : { allOf: schemas };

const hasRequired = (schema: JsonSchema): boolean =>
	(Array.isArray(schema.required) && schema.required.length > 0) ||
	(Array.isArray(schema.allOf) &&
		schema.allOf.some((part) => isObject(part) && hasRequired(part)));

const createToolDefinition = (
	route: RouteDefinition & { path: string },
	routePath: readonly string[],
	converter: Converter | undefined,
): ToolDefinition | undefined => {
	const responses = Object.values(route.responses);
	// Streams and raw responses are not JSON.
	if (route.raw || responses.some((response) => response.sse)) return;

	const convert = (schemas: readonly StandardSchemaV1[]) =>
		schemas.map((schema) => converter?.(schema, "input") ?? {});
	const { params, query, headers, body } = route.request ?? {};
	// Tool arguments are JSON, so a route must accept a JSON body.
	if (body) {
		const accepted = contentTypesOf(headers ?? [], converter, "input");
		if (!accepted.includes("application/json") && !accepted.includes("*/*")) {
			return;
		}
	}

	const properties: Record<string, JsonSchema> = {};
	const required: string[] = [];
	const add = (name: string, schema: JsonSchema, isRequired: boolean) => {
		properties[name] = schema;
		if (isRequired) required.push(name);
	};

	// Without a params schema, path params are strings, as they are received.
	const pathParams = getPathParamNames(route.path);
	if (pathParams.length > 0) {
		add(
			"params",
			params
				? allOf(convert(params))
				: {
						type: "object",
						properties: Object.fromEntries(
							pathParams.map((name) => [name, { type: "string" }]),
						),
						required: pathParams,
					},
			true,
		);
	}
	if (query) {
		const schema = allOf(convert(query));
		add("query", schema, hasRequired(schema));
	}
	if (headers) {
		const schema = allOf(convert(headers));
		add("headers", schema, hasRequired(schema));
	}
	if (body) add("body", allOf(convert(body)), true);

	// With several defined responses, the body depends on the status.
	const [response, ...otherResponses] = responses;
	const outputSchema =
		response?.body && otherResponses.length === 0
			? converter?.(response.body, "output")
			: undefined;

	const { summary, description } = route.openApi ?? {};
	return {
		name: toToolName(routePath),
		...(summary && { title: summary }),
		description: description ?? summary ?? `${route.method} ${route.path}`,
		inputSchema: {
			type: "object",
			properties,
			...(required.length > 0 && { required }),
		},
		...(outputSchema && { outputSchema }),
		...(route.method === "GET"
			? { annotations: { readOnlyHint: true } }
			: (route.method === "PUT" || route.method === "DELETE") && {
					annotations: { idempotentHint: true },
				}),
	};
};

// Checks the body itself, not its contents, which are left to
// `JSON.stringify()`.
const isJsonBody = (body: unknown) => {
	if (
		body === null ||
		typeof body === "string" ||
		typeof body === "number" ||
		typeof body === "boolean" ||
		Array.isArray(body)
	) {
		return true;
	}

	if (typeof body !== "object") return false;
	const proto = Object.getPrototypeOf(body);
	const isPlainObject = proto === Object.prototype || proto === null;
	const hasToJSON = typeof (body as { toJSON?: unknown }).toJSON === "function";
	return isPlainObject || hasToJSON;
};

const toErrorResult = (error: RouteError): ToolResult => {
	const { code, status, message, data } = error;
	const json = {
		code,
		status,
		message,
		...(data !== undefined && { data }),
		defined: isDefinedError(error),
	};
	return {
		content: [{ type: "text", text: JSON.stringify(json) }],
		isError: true,
	};
};

const toToolResult = (body: unknown): ToolResult => {
	if (body === undefined) return { content: [] };
	if (!isJsonBody(body)) {
		throw new TypeError("The route returned a body that is not JSON.");
	}
	// MCP has the text be the serialized `structuredContent`. It is parsed from
	// the text since `toJSON()` can change a value's shape. A string is sent as
	// it is, which models read better than JSON.
	const text = JSON.stringify(body);
	const json = JSON.parse(text) as JsonValue;
	return {
		content: [{ type: "text", text: typeof json === "string" ? json : text }],
		structuredContent: json,
	};
};

const createCall =
	(route: ImplementedRoute, onError: CreateToolsFromRoutesOptions["onError"]) =>
	async (
		{ params, query, headers, body }: Record<string, unknown>,
		options: ToolCallOptions<object> = {},
	) => {
		const request = {
			...(params !== undefined && { params }),
			...(query !== undefined && { query }),
			headers: {
				...(isObject(headers) && headers),
				...options.headers,
				...(body !== undefined && { "content-type": "application/json" }),
			},
			...(body !== undefined && { body }),
		};
		try {
			const result = await call(
				route,
				request as never,
				{
					context: options.context,
					signal: options.signal,
				} as never,
			);
			return toToolResult(result.body);
		} catch (error) {
			// As over HTTP, the model doesn't receive what isn't a `RouteError`.
			const sent =
				error instanceof RouteError
					? error
					: new InternalServerError({ cause: error });
			onError?.(sent);
			return toErrorResult(sent);
		}
	};

/**
 * Creates a tool for each route in a route tree, to register with an MCP
 * server or an agent SDK. Calls run through the route's validation and
 * middleware without HTTP.
 *
 * @remarks Tool arguments and results are JSON, so routes with streamed or
 * raw responses, or a body that isn't JSON, are left out. A result is the
 * response body, without its status, headers and cookies. A tool is named by
 * its key path joined with `_`, and two routes whose names are the same throw
 * when the tools are created.
 *
 * @see {@link https://rest-rpc.vercel.app/docs/tooling/mcp-tools}
 */
export function createToolsFromRoutes<
	TRouter extends RuntimeImplementationTree,
>(
	router: TRouter,
	options: CreateToolsFromRoutesOptions = {},
): Array<
	AgentTool<TreeInitialContext<TRouter>> & {
		/** The route the tool calls, with `meta` typed by `DefaultMeta`. */
		route: Omit<RouteDefinition, "meta"> & {
			path: string;
			meta?: Partial<DefaultMeta>;
		};
		/** The route's key path in the route tree, such as `["posts", "get"]`. */
		routePath: readonly string[];
	}
> {
	const { schemaConverter, onError } = options;
	const tools = [];
	const names = new Set<string>();
	for (const { route, path } of contractRouteEntries(router)) {
		const definition = createToolDefinition(route, path, schemaConverter);
		if (!definition) continue;
		if (names.has(definition.name)) {
			throw new Error(`Two routes have the tool name "${definition.name}".`);
		}
		names.add(definition.name);
		const leaf = { "~restrpc": route } as unknown as ImplementedRoute;
		tools.push({
			definition,
			route,
			routePath: path,
			call: createCall(leaf, onError) as AgentTool<object>["call"],
		});
	}
	return tools as never;
}
