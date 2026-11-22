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
	deprecated?: boolean;
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
	description?: string;
	headers?: Record<
		string,
		{ description?: string; required?: boolean; schema?: OpenApiSchema }
	>;
	content?: Record<
		string,
		{ schema?: OpenApiSchema; itemSchema?: OpenApiSchema }
	>;
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
// lists it, a header without a readable value allows any, and without one a
// response body is JSON, and a request body JSON or multipart, as the server
// accepts.
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
	return mode === "input"
		? ["application/json", "multipart/form-data"]
		: ["application/json"];
};

const toContent = (contentTypes: readonly string[], schema: OpenApiSchema) =>
	Object.fromEntries(contentTypes.map((type) => [type, { schema }]));

// Parameter and header objects carry their own description, which tools show
// instead of the schema's.
const describedBy = (schema: OpenApiSchema) => ({
	...(typeof schema.description === "string" && {
		description: schema.description,
	}),
	...(schema.deprecated === true && { deprecated: true }),
});

// OpenAPI ignores these header parameters: the body's content type, the
// content types the client accepts, and the credentials `security` describes.
const ignoredHeaders = new Set(["content-type", "accept", "authorization"]);

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

	return Object.entries(properties).flatMap(([name, propertySchema]) => {
		if (location === "header" && ignoredHeaders.has(name)) return [];
		const parameter: OpenApiParameter = {
			name,
			in: location,
			required: location === "path" || requiredKeys.has(name),
			...describedBy(propertySchema),
			schema: propertySchema,
		};
		// Query arrays are sent and parsed as repeated `name[]=value` keys.
		return location === "query" && propertySchema.type === "array"
			? { ...parameter, name: `${name}[]`, style: "form", explode: true }
			: parameter;
	});
};

// Every segment of the path template is a parameter, as OpenAPI requires. One
// the params schema doesn't convert is received as a string.
const createPathParameters = (
	route: RouteDefinition & { path: string },
	options: CreateOperationOptions,
): OpenApiParameter[] => {
	const fromSchema = new Map(
		createParameters(route.request?.params, "path", options).map(
			(parameter) => [parameter.name, parameter],
		),
	);
	return getPathParamNames(route.path).map(
		(name) =>
			fromSchema.get(name) ?? {
				name,
				in: "path",
				required: true,
				schema: { type: "string" },
			},
	);
};

const createRequestBody = (
	request: RouteRequestDefinition | undefined,
	converter: SchemaConverter | undefined,
): OpenApiRequestBody | undefined => {
	if (!request?.body) return undefined;

	const convertedSchemas = request.body.map(
		(schema) => converter?.(schema, "input") ?? {},
	);
	// A schema can't tell whether it accepts a missing body, so a defined body
	// is documented as required.
	return {
		required: true,
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
		...(responseDefinition.description && {
			description: responseDefinition.description,
		}),
		...(headers ? { headers } : {}),
	};
	// The schema describes each event, whose JSON `data` the sse schema
	// validates, as OpenAPI 3.2 models Server-Sent Events.
	if (sse) {
		return {
			...response,
			content: {
				"text/event-stream": {
					itemSchema: {
						type: "object",
						required: ["data"],
						properties: {
							data: {
								type: "string",
								contentMediaType: "application/json",
								contentSchema: converter?.(sse, "output") ?? {},
							},
							event: { type: "string" },
							id: { type: "string" },
							retry: { type: "integer", minimum: 0 },
						},
					},
				},
			},
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
	const required = new Set(
		Array.isArray(schema.required) ? schema.required : [],
	);
	const entries = Object.entries(getSchemaProperties(schema))
		// The `content-type` header is the body's content key instead.
		.filter(([name]) => name !== "content-type")
		.map(([name, propertySchema]) => [
			name,
			{
				...describedBy(propertySchema),
				...(required.has(name) && { required: true }),
				schema: propertySchema,
			},
		]);
	return entries.length > 0 ? Object.fromEntries(entries) : undefined;
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
		const description = group
			.flatMap(([, definition]) => definition.description ?? [])
			.join("\n");
		responses[status] = {
			...(description && { description }),
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
			default: route.raw
				? {
						...(rawDescription(route.raw) && {
							description: rawDescription(route.raw),
						}),
					}
				: {
						description:
							"Response inferred from the route handler; not documented.",
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
	const { extensions, operationId, ...openApi } = route.openApi ?? {};
	// The key path is unique in the tree, and the name of the client call. A
	// route that sets `operationId`, even to an empty value, keeps its own.
	const id =
		route.openApi && "operationId" in route.openApi
			? operationId
			: routePath.join(".");
	const operation: OpenApiOperation = {
		...(id ? { operationId: id } : {}),
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
