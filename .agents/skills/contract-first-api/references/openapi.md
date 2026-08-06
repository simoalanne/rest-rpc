# @contract-first-api/openapi

Use this reference for generating OpenAPI documents from contract trees.

## Purpose

`@contract-first-api/openapi` generates a plain OpenAPI document object from a
shared contract tree.

It does not write files, register routes, or serve documentation UIs.

## Main Setup

Use `createOpenApiDocument()` with the shared contract and document options.

```ts
const openApiDocument = createOpenApiDocument(contract, {
	info: {
		title: "Todo API",
		version: "1.0.0",
	},
	servers: [{ url: "http://localhost:3000" }],
});
```

The result is a normal object that can be:

- written to disk
- returned from an endpoint
- passed to other tooling

Write to disk:

```ts
writeFileSync("openapi.json", JSON.stringify(openApiDocument, null, 2));
```

Serve from Express:

```ts
app.get("/openapi.json", (_req, res) => {
	res.json(openApiDocument);
});
```

## Contract Mapping

The generator creates one OpenAPI operation per JSON route.

Key mappings:

- `path` like `/todos/:id` becomes `/todos/{id}`
- `method` becomes the operation method
- `request.params` becomes path parameters
- `request.query` becomes query parameters
- `request.headers` becomes header parameters
- `request.body` becomes a JSON request body, the declared custom body content
  type when using `customBody(...)`, or no request body when using `noBody()`
- each `responses` entry becomes an OpenAPI response for that status
- `noBody()` responses are emitted without JSON content
- route `openApi` fields become operation fields

The generator only emits required OpenAPI structure, contract-derived schemas,
and OpenAPI fields provided by the contract or transform hooks. Response
descriptions come from `openApi.responseDescriptions` and otherwise default to
an empty string because OpenAPI requires the field.

HTTP routes are included. Custom bodies are documented with their declared
content type. WebSocket routes and routes with streaming responses are not part
of the generated OpenAPI document.

## Schema Conversion

Standard Schema defines validation, not JSON Schema conversion. OpenAPI
generation requires a `schemaConverter` option for the project's schema
library.

- request schemas use input mode
- response schemas use output mode
- if no JSON Schema converter exists, skip OpenAPI generation for faithful docs
  or provide an intentionally loose converter that returns broad schemas such
  as `{}`
- use `isTypeOnlySchema()` to detect core `type<T>()` schemas and
  `looseJsonSchema()` to return a broad `{}` schema
- schema-record field requiredness is based on whether each field schema
  accepts `undefined`
- path parameters must be required; optional path parameter schemas fail
  OpenAPI generation

Example with Zod:

```ts
import { isTypeOnlySchema, looseJsonSchema } from "@contract-first-api/core";
import z from "zod";

const document = createOpenApiDocument(contract, {
	info: {
		title: "Todo API",
		version: "1.0.0",
	},
	schemaConverter: (schema, { io }) => {
		if (isTypeOnlySchema(schema)) return looseJsonSchema(schema);

		switch (schema["~standard"].vendor) {
			case "zod":
				return z.toJSONSchema(schema as z.ZodType, { io });
			default:
				return looseJsonSchema(schema);
		}
	},
});
```

Use the matching converter for Valibot, ArkType, or another Standard
Schema-compatible library.

## Route OpenAPI Hints

Use route `openApi` for common operation fields:

```ts
const contract = router(
	{
		todos: {
			list: {
				method: "GET",
				path: "/todos",
				openApi: {
					summary: "List todos",
					operationId: "listTodos",
					tags: ["Todos"],
					responseDescriptions: {
						200: "Todos returned.",
					},
				},
				responses: {
					200: todoListSchema,
				},
			},
		},
	},
	{
		commonOpenApi: {
			tags: ["Todos"],
			security: [{ bearerAuth: [] }],
			responseDescriptions: {
				401: "Authentication is required.",
			},
		},
	},
);
```

`commonOpenApi` is for shared operation hints such as `tags`, `deprecated`,
`security`, `externalDocs`, `responseDescriptions`, and `extensions`.

## Customization Hooks

- `transformOperation`
  Use for OpenAPI fields not modeled directly by route `openApi`, often using
  route `metadata` as the input.
- `transformDocument`
  Use for top-level document fields and shared components such as security
  schemes.

Route-level customization:

```ts
const document = createOpenApiDocument(contract, {
	info: {
		title: "Todo API",
		version: "1.0.0",
	},
	transformOperation: ({ route, operation }) => ({
		...operation,
		"x-auth": route.metadata.auth,
	}),
});
```

Top-level customization:

```ts
const document = createOpenApiDocument(contract, {
	info: {
		title: "Todo API",
		version: "1.0.0",
	},
	transformDocument: (document) => ({
		...document,
		components: {
			...document.components,
			securitySchemes: {
				bearerAuth: {
					type: "http",
					scheme: "bearer",
				},
			},
		},
	}),
});
```

## Use This Package When

- exporting an OpenAPI document from shared API contract.
- adding route-level summaries, tags, or security settings
- adding top-level components or shared document customization
