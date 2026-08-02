# @contract-first-api/openapi

Use this reference for generating OpenAPI documents from contract trees.

## Purpose

`@contract-first-api/openapi` generates a plain OpenAPI document object from a
shared contract tree.

It does not write files, register routes, or serve documentation UIs.

## Main Setup

Use `createOpenApiDocument()` with the shared contracts and document metadata.

```ts
const openApiDocument = createOpenApiDocument(contracts, {
	info: {
		title: "Todo API",
		version: "1.0.0",
	},
	servers: [{ url: "http://localhost:3000/api" }], // if the backend uses a route prefix, include it here
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

The generator creates one OpenAPI operation per JSON contract.

Key mappings:

- `path` like `/todos/:id` becomes `/todos/{id}`
- `method` becomes the operation method
- `request.params` becomes path parameters
- `request.query` becomes query parameters
- `request.body` becomes a JSON request body
- each `responses` entry becomes an OpenAPI response for that status
- `noBody` responses are emitted without JSON content

Only JSON HTTP contracts are included. Raw request contracts, websocket
contracts, and contracts with streaming responses are not part of the generated
OpenAPI document.

## Schema Conversion

Zod schemas are converted using Zod 4 `z.toJSONSchema()`.

- request schemas use input mode
- response schemas use output mode

By default, unrepresentable schemas throw during generation. If needed, schema
behavior can be relaxed with the `schema.unrepresentable` option.

```ts
const document = createOpenApiDocument(contracts, {
	info: {
		title: "Todo API",
		version: "1.0.0",
	},
	schema: {
		unrepresentable: "any",
	},
});
```

## Customization Hooks

- `transformOperation`
  Use for route-level OpenAPI fields such as `summary`, `tags`, `security`, or
  vendor extensions.
- `transformDocument`
  Use for top-level document fields and shared components such as security
  schemes.

Route-level customization:

```ts
const document = createOpenApiDocument(contracts, {
	info: {
		title: "Todo API",
		version: "1.0.0",
	},
	transformOperation: ({ contract, operation }) => ({
		...operation,
		...(contract.meta?.requiresAuth
			? { security: [{ bearerAuth: [] }] }
			: {}),
	}),
});
```

Top-level customization:

```ts
const document = createOpenApiDocument(contracts, {
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

- exporting an OpenAPI document from shared contracts
- adding route-level summaries, tags, or security metadata
- adding top-level components or shared document customization
