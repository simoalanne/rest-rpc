import {
	isDefinedError,
	RouteError,
	type CreateOpenApiDocumentOptions,
} from "@rest-rpc/core";
import {
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

/**
 * Hints about a tool's behavior, the `annotations` of an MCP tool.
 *
 * @see {@link https://rest-rpc.vercel.app/docs/mcp-tools#tool-definitions}
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
 * 2025-11-25.
 *
 * @see {@link https://rest-rpc.vercel.app/docs/mcp-tools#tool-definitions}
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
	/** The JSON Schema of `structuredContent`, an object, set when every successful result has one. */
	outputSchema?: JsonSchema & { type: "object" };
	/** Hints about the tool's behavior. */
	annotations?: ToolAnnotations;
};

/**
 * The result of a tool call, shaped like the MCP `CallToolResult`.
 *
 * @see {@link https://rest-rpc.vercel.app/docs/mcp-tools#results-and-errors}
 */
export type ToolResult = {
	/** The result as text: a string body, or the body or error as JSON. Empty when there is no body. */
	content: Array<{ type: "text"; text: string }>;
	/** A JSON object body. */
	structuredContent?: Record<string, unknown>;
	/** Set when the call failed, with the error as JSON in `content`. */
	isError?: boolean;
};

/**
 * Options of a tool call. `context` is required when the routes require
 * initial context.
 *
 * @see {@link https://rest-rpc.vercel.app/docs/mcp-tools#context-and-headers}
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
 * @see {@link https://rest-rpc.vercel.app/docs/mcp-tools}
 */
export type AgentTool<TContext extends object = EmptyObject> = {
	/** The tool definition, as registered with an MCP server or agent framework. */
	definition: ToolDefinition;
	/**
	 * Calls the tool with the arguments a model sent, and resolves with the
	 * result. Errors resolve as results with `isError` instead of rejecting.
	 */
	call: (
		args: unknown,
		...options: OptionsArgs<TContext, ToolCallOptions<TContext>>
	) => Promise<ToolResult>;
};

/**
 * Options of `createToolsFromRoutes()`.
 *
 * @see {@link https://rest-rpc.vercel.app/docs/mcp-tools#options}
 */
export type CreateToolsFromRoutesOptions = {
	/**
	 * Converts Standard Schema definitions into JSON Schema, the same converter
	 * as OpenAPI's. Without it, or when it returns `undefined`, a segment
	 * accepts any value.
	 */
	schemaConverter?: CreateOpenApiDocumentOptions["schemaConverter"];
	/**
	 * Called with errors sent to the model as `INTERNAL_SERVER_ERROR`, such as
	 * errors thrown by handlers, whose details the model does not receive.
	 */
	onError?: (error: unknown) => void;
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

// Tool arguments are JSON, so a body is sent as JSON. A declared
// `content-type` header, read as OpenAPI reads it, is sent with it, and a
// route that doesn't accept JSON is left out with `null`.
const requestContentType = (headers: readonly JsonSchema[]) => {
	for (const schema of headers) {
		const header = isObject(schema.properties)
			? schema.properties["content-type"]
			: undefined;
		if (!isObject(header)) continue;
		const declared =
			typeof header.const === "string"
				? [header.const]
				: Array.isArray(header.enum)
					? header.enum.map(String)
					: ["application/json"];
		return declared.includes("application/json") ? "application/json" : null;
	}
	return undefined;
};

type ToolRequest = {
	definition: ToolDefinition;
	contentType: string | undefined;
};

const createToolRequest = (
	route: RouteDefinition & { path: string },
	routePath: readonly string[],
	converter: Converter | undefined,
): ToolRequest | undefined => {
	const responses = Object.values(route.responses);
	// Streams and raw responses are not JSON.
	if (route.raw || responses.some((response) => response.sse)) return;

	// Converted schemas are nested in the input schema, where JSON Schema
	// doesn't allow `$schema`, so it is left out.
	const convert = (
		schemas: readonly StandardSchemaV1[],
		mode: "input" | "output" = "input",
	) =>
		schemas.map((schema) => {
			const { $schema: _, ...converted } = converter?.(schema, mode) ?? {};
			return converted;
		});
	const { params, query, headers, body } = route.request ?? {};
	const headerSchemas = convert(headers ?? []);
	const contentType = body ? requestContentType(headerSchemas) : undefined;
	if (contentType === null) return;

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
		const schema = allOf(headerSchemas);
		add("headers", schema, hasRequired(schema));
	}
	if (body) add("body", allOf(convert(body)), true);

	// A result has structured content only when its body is an object, so the
	// output schema is advertised for a single defined response with one.
	const [response, ...otherResponses] = responses;
	const output =
		response?.body && otherResponses.length === 0
			? convert([response.body], "output")[0]
			: undefined;

	const { summary, description } = route.openApi ?? {};
	return {
		contentType,
		definition: {
			name: toToolName(routePath),
			...(summary && { title: summary }),
			description: description ?? summary ?? `${route.method} ${route.path}`,
			inputSchema: {
				type: "object",
				properties,
				...(required.length > 0 && { required }),
			},
			...(output?.type === "object" && {
				outputSchema: output as ToolDefinition["inputSchema"],
			}),
			...(route.method === "GET"
				? { annotations: { readOnlyHint: true } }
				: (route.method === "PUT" || route.method === "DELETE") && {
						annotations: { idempotentHint: true },
					}),
		},
	};
};

const isUnsupportedBody = (body: unknown) =>
	body instanceof Blob ||
	body instanceof ArrayBuffer ||
	ArrayBuffer.isView(body) ||
	body instanceof ReadableStream ||
	(typeof body === "object" && body !== null && Symbol.asyncIterator in body);

const toToolResult = (body: unknown): ToolResult => {
	if (body === undefined) return { content: [] };
	if (typeof body === "string") {
		return { content: [{ type: "text", text: body }] };
	}
	if (isUnsupportedBody(body)) {
		throw new TypeError(
			"The route returned a binary or stream body, which tools do not return.",
		);
	}
	// The JSON round trip gives the values the body has over HTTP.
	const text = JSON.stringify(body);
	const json: unknown = JSON.parse(text);
	return {
		content: [{ type: "text", text }],
		...(isObject(json) && { structuredContent: json }),
	};
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

const createCall =
	(
		route: ImplementedRoute,
		contentType: string | undefined,
		onError: CreateToolsFromRoutesOptions["onError"],
	) =>
	async (args: unknown, options: ToolCallOptions<object> = {}) => {
		const { params, query, headers, body } = isObject(args) ? args : {};
		const request = {
			...(params !== undefined && { params }),
			...(query !== undefined && { query }),
			headers: {
				...(isObject(headers) && headers),
				...options.headers,
				...(contentType && { "content-type": contentType }),
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
			// As over HTTP, other errors are sent without their details.
			const sent =
				error instanceof RouteError
					? error
					: new InternalServerError({ cause: error });
			if (sent instanceof InternalServerError) onError?.(error);
			return toErrorResult(sent);
		}
	};

/**
 * Creates a tool for each route in a route tree, to register with an MCP
 * server or an agent framework. Calls run through the route's validation and
 * middleware without HTTP.
 *
 * @remarks Tool arguments and results are JSON, so routes with streamed or
 * raw responses, or a body that isn't JSON, are left out. A result is the
 * response body, without its status, headers and cookies. A tool is named by
 * its key path joined with `_`, and two routes whose names are the same throw
 * when the tools are created.
 *
 * @see {@link https://rest-rpc.vercel.app/docs/mcp-tools}
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
		const request = createToolRequest(route, path, schemaConverter);
		if (!request) continue;
		const { definition, contentType } = request;
		if (names.has(definition.name)) {
			throw new Error(`Two routes have the tool name "${definition.name}".`);
		}
		names.add(definition.name);
		const leaf = { "~restrpc": route } as unknown as ImplementedRoute;
		tools.push({
			definition,
			route,
			routePath: path,
			call: createCall(leaf, contentType, onError) as AgentTool<object>["call"],
		});
	}
	return tools as never;
}
