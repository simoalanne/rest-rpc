import type {
	DefaultMeta,
	RouteRequestDefinition,
	RouteDefinition,
} from "../contract/routeDefinition.ts";
import type {
	ResponseDefinition,
	ResponseHeadersSchema,
} from "../contract/response.ts";
import type { RouteErrorDefinition } from "../contract/routeError.ts";
import type { StandardSchemaV1 } from "../standard-schema/index.ts";
import { getPathParamNames } from "../contract/path.ts";
import { rawDescription } from "../contract/raw.ts";

type OpenApiSchema = Record<string, unknown>;

type OpenApiParameter = {
	name: string;
	in: "path" | "query" | "header" | "cookie";
	required?: boolean;
	description?: string;
	style?: "form";
	explode?: boolean;
	schema?: OpenApiSchema;
	content?: Record<string, { schema?: OpenApiSchema }>;
};

type OpenApiRequestBody = {
	required?: boolean;
	description?: string;
	content: Record<string, { schema?: OpenApiSchema }>;
};

type OpenApiResponse = {
	description: string;
	headers?: Record<string, { description?: string; schema?: OpenApiSchema }>;
	content?: Record<string, { schema?: OpenApiSchema }>;
};

type OpenApiExternalDocs = {
	url: string;
	description?: string;
};

export type OpenApiOperation = {
	operationId?: string;
	summary?: string;
	description?: string;
	tags?: string[];
	deprecated?: boolean;
	parameters?: OpenApiParameter[];
	requestBody?: OpenApiRequestBody;
	responses: Record<string, OpenApiResponse>;
	security?: Array<Record<string, string[]>>;
	externalDocs?: OpenApiExternalDocs;
	[key: `x-${string}`]: unknown;
};

export type SchemaConverter = (
	schema: StandardSchemaV1,
	mode: "input" | "output",
) => OpenApiSchema | undefined;

export type OperationTransformContext = {
	/** The route, with `meta` typed by `DefaultMeta`. */
	route: Omit<RouteDefinition, "meta"> & { meta?: Partial<DefaultMeta> };
	routePath: readonly string[];
	operation: OpenApiOperation;
};

type CreateOperationOptions = {
	schemaConverter?: SchemaConverter;
	transformOperation?: (context: OperationTransformContext) => OpenApiOperation;
};

const getSchemaProperties = (schema: OpenApiSchema) => {
	const properties = schema.properties;
	return typeof properties === "object" &&
		properties !== null &&
		!Array.isArray(properties)
		? (properties as Record<string, OpenApiSchema>)
		: {};
};

// A body's content type is its `content-type` header. A `const` or `enum`
// lists it, a header without a readable value allows any, and a body without
// one is JSON.
const contentTypesOf = (
	headers: readonly StandardSchemaV1[],
	converter: SchemaConverter | undefined,
	mode: "input" | "output",
): readonly string[] => {
	for (const schema of headers) {
		const header = getSchemaProperties(converter?.(schema, mode) ?? {})[
			"content-type"
		];
		if (!header) continue;
		if (typeof header.const === "string") return [header.const];
		if (Array.isArray(header.enum)) return header.enum.map(String);
		return ["*/*"];
	}
	return ["application/json"];
};

const toContent = (contentTypes: readonly string[], schema: OpenApiSchema) =>
	Object.fromEntries(contentTypes.map((type) => [type, { schema }]));

const createParameters = (
	schemas: readonly StandardSchemaV1[] | undefined,
	location: "path" | "query" | "header",
	options: CreateOperationOptions,
): OpenApiParameter[] => {
	if (!schemas) return [];

	const properties: Record<string, OpenApiSchema> = {};
	const requiredKeys = new Set<unknown>();
	for (const schema of schemas) {
		const jsonSchema = options.schemaConverter?.(schema, "input") ?? {};
		for (const [name, propertySchema] of Object.entries(
			getSchemaProperties(jsonSchema),
		)) {
			properties[name] = properties[name]
				? { allOf: [properties[name], propertySchema] }
				: propertySchema;
		}
		const required = Array.isArray(jsonSchema.required)
			? jsonSchema.required
			: [];
		for (const name of required) requiredKeys.add(name);
	}

	// OpenAPI ignores a `content-type` header parameter: it is the body's.
	delete properties["content-type"];
	return Object.entries(properties).map(([name, propertySchema]) => {
		const parameter: OpenApiParameter = {
			name,
			in: location,
			required: location === "path" || requiredKeys.has(name),
			schema: propertySchema,
		};
		// Query arrays are sent and parsed as repeated `name[]=value` keys.
		return location === "query" && propertySchema.type === "array"
			? { ...parameter, name: `${name}[]`, style: "form", explode: true }
			: parameter;
	});
};

// Dynamic path segments without a params schema are received as strings.
const createPathParameters = (
	route: RouteDefinition & { path: string },
	options: CreateOperationOptions,
): OpenApiParameter[] =>
	route.request?.params?.length
		? createParameters(route.request.params, "path", options)
		: getPathParamNames(route.path).map((name) => ({
				name,
				in: "path",
				required: true,
				schema: { type: "string" },
			}));

const createRequestBody = (
	request: RouteRequestDefinition | undefined,
	converter: SchemaConverter | undefined,
): OpenApiRequestBody | undefined => {
	if (!request?.body) return undefined;

	const convertedSchemas = request.body.map(
		(schema) => converter?.(schema, "input") ?? {},
	);
	return {
		content: toContent(
			contentTypesOf(request.headers ?? [], converter, "input"),
			convertedSchemas.length === 1
				? convertedSchemas[0]!
				: { allOf: convertedSchemas },
		),
	};
};

const createResponse = (
	responseDefinition: ResponseDefinition,
	converter: SchemaConverter | undefined,
): OpenApiResponse => {
	const { body, sse } = responseDefinition;
	const headers = createResponseHeaders(responseDefinition.headers, converter);
	const response: OpenApiResponse = {
		description: responseDefinition.description ?? "",
		...(headers ? { headers } : {}),
	};
	if (sse) {
		return {
			...response,
			content: toContent(
				["text/event-stream"],
				converter?.(sse, "output") ?? {},
			),
		};
	}
	if (!body) return response;

	return {
		...response,
		content: toContent(
			contentTypesOf(
				responseDefinition.headers ? [responseDefinition.headers] : [],
				converter,
				"output",
			),
			converter?.(body, "output") ?? {},
		),
	};
};

const createResponseHeaders = (
	headers: ResponseHeadersSchema | undefined,
	converter: SchemaConverter | undefined,
): OpenApiResponse["headers"] | undefined => {
	if (!headers) return undefined;

	const schema = converter?.(headers, "output") ?? {};
	return Object.fromEntries(
		Object.entries(getSchemaProperties(schema))
			// The `content-type` header is the body's content key instead.
			.filter(([name]) => name !== "content-type")
			.map(([name, propertySchema]) => [name, { schema: propertySchema }]),
	);
};

const createErrorBodySchema = (
	code: string,
	definition: RouteErrorDefinition,
	converter: SchemaConverter | undefined,
): OpenApiSchema => ({
	type: "object",
	properties: {
		code: { const: code },
		message: { type: "string" },
		...(definition.data && {
			data: converter?.(definition.data, "output") ?? {},
		}),
	},
	required: definition.data ? ["code", "message", "data"] : ["code", "message"],
});

// Errors sharing a status are documented as one response.
const createErrorResponses = (
	errors: Readonly<Record<string, RouteErrorDefinition>>,
	converter: SchemaConverter | undefined,
) => {
	const byStatus = new Map<number, [string, RouteErrorDefinition][]>();
	for (const [code, definition] of Object.entries(errors)) {
		const group = byStatus.get(definition.status) ?? [];
		group.push([code, definition]);
		byStatus.set(definition.status, group);
	}

	const responses: Record<string, OpenApiResponse> = {};
	for (const [status, group] of byStatus) {
		const schemas = group.map(([code, definition]) =>
			createErrorBodySchema(code, definition, converter),
		);
		const headers = Object.assign(
			{},
			...group.map(([, definition]) =>
				createResponseHeaders(definition.headers, converter),
			),
		);
		responses[status] = {
			description: group
				.flatMap(([, definition]) => definition.description ?? [])
				.join("\n"),
			...(Object.keys(headers).length > 0 ? { headers } : {}),
			content: {
				"application/json": {
					schema: schemas.length === 1 ? schemas[0] : { oneOf: schemas },
				},
			},
		};
	}
	return responses;
};

const createResponses = (
	route: RouteDefinition,
	converter: SchemaConverter | undefined,
) => {
	const defined = Object.entries(route.responses);
	const errors = createErrorResponses(route.errors ?? {}, converter);
	// Responses inferred from a handler, or sent as the `Response` it returns,
	// have no schema. `default` documents them without claiming a status, and
	// keeps the required Responses Object non-empty.
	if (defined.length === 0) {
		return {
			default: {
				description: route.raw
					? (rawDescription(route.raw) ?? "")
					: "Response inferred from the route handler; not documented.",
			},
			...errors,
		};
	}

	const responses: Record<string, OpenApiResponse> = {};
	for (const [status, schema] of defined) {
		responses[status] = createResponse(schema, converter);
	}

	return { ...responses, ...errors };
};

export const createOperation = (
	route: RouteDefinition & { path: string },
	options: CreateOperationOptions,
	routePath: readonly string[],
): OpenApiOperation => {
	const { request } = route;
	const parameters = [
		...createPathParameters(route, options),
		...createParameters(request?.query, "query", options),
		...createParameters(request?.headers, "header", options),
	];
	const requestBody = createRequestBody(request, options.schemaConverter);
	const { extensions, ...openApi } = route.openApi ?? {};
	const operation: OpenApiOperation = {
		...openApi,
		...extensions,
		...(parameters.length > 0 ? { parameters } : {}),
		...(requestBody ? { requestBody } : {}),
		responses: createResponses(route, options.schemaConverter),
	};

	return (
		options.transformOperation?.({ route, routePath, operation }) ?? operation
	);
};
