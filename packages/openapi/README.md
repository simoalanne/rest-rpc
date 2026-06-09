# @contract-first-api/openapi

Generate an OpenAPI document from a shared contract tree.

This package consumes contracts from `@contract-first-api/core` and turns them
into a plain OpenAPI document object. It does not write files, register routes,
serve Swagger UI, or choose a documentation frontend. You decide whether to
write the document to disk, expose it from your backend, or pass it to another
tool.

## Install

```bash
pnpm add @contract-first-api/openapi
```

## Create A Document

```ts
import { createOpenApiDocument } from "@contract-first-api/openapi";
import { contracts } from "@example/shared";

export const openApiDocument = createOpenApiDocument(contracts, {
	info: {
		title: "Todo API",
		version: "1.0.0",
	},
	servers: [{ url: "http://localhost:3000/api" }],
});
```

The returned value is a normal object. You can write it to a file:

```ts
import { writeFileSync } from "node:fs";
import { openApiDocument } from "./openapi.ts";

writeFileSync("openapi.json", JSON.stringify(openApiDocument, null, 2));
```

Or expose it from your backend:

```ts
app.get("/openapi.json", (_req, res) => {
	res.json(openApiDocument);
});
```

## Contract Mapping

The generator walks the contract tree and creates one OpenAPI operation for
each JSON contract.

- `path` values like `/todos/:id` become `/todos/{id}`
- `method` becomes the OpenAPI operation method
- `request.params` becomes path parameters
- `request.query` becomes query parameters
- `request.body` becomes a JSON request body
- `response` becomes the success response schema
- `successStatusCode` becomes the success response status when provided
- `errors` become additional response entries

Only JSON contracts are included in the generated document.

## Zod JSON Schema

Schemas are converted with Zod 4's built-in `z.toJSONSchema()` support. Request
schemas use input mode, and response schemas use output mode.

By default, unrepresentable Zod schemas throw during document generation. This
keeps the generated document from silently describing something less precise
than the contract.

```ts
createOpenApiDocument(contracts, {
	info: {
		title: "Todo API",
		version: "1.0.0",
	},
	schema: {
		unrepresentable: "any",
	},
});
```

## Customizing The Document

Use `transformOperation` for route-level OpenAPI fields such as `summary`,
`tags`, `security`, or vendor extensions.

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

Use `transformDocument` for top-level fields and shared components.

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
