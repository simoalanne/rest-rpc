# contract-first-api

`contract-first-api` is a small TypeScript toolkit for defining an API contract once and reusing it across your stack.

The workflow is:

1. Define your contract tree with `@contract-first-api/core`.
2. Mount it on an Express server with `@contract-first-api/express`.
3. Create a typed client with `@contract-first-api/api-client`.
4. Optionally wrap that client for React Query with `@contract-first-api/react-query`.

## Packages

- `@contract-first-api/core`: define contracts and derive request and response types
- `@contract-first-api/express`: connect contracts to Express route handlers
- `@contract-first-api/api-client`: create a typed runtime client from the contract tree
- `@contract-first-api/react-query`: turn the typed client into React Query hooks and cache helpers

## Install

```bash
pnpm add @contract-first-api/core
```

Add the other packages depending on your stack:

```bash
pnpm add @contract-first-api/express @contract-first-api/api-client @contract-first-api/react-query
```

## Basic flow

```ts
import { initContracts } from "@contract-first-api/core";
import z from "zod";

const { defineContract } = initContracts();

export const contracts = defineContract({
  todos: {
    list: {
      method: "GET",
      path: "/todos",
      response: z.object({
        items: z.array(
          z.object({
            id: z.string(),
            title: z.string(),
          }),
        ),
      }),
    },
    create: {
      method: "POST",
      path: "/todos",
      request: {
        body: z.object({
          title: z.string().min(1),
        }),
      },
      response: z.object({
        id: z.string(),
        title: z.string(),
      }),
    },
  },
});
```

From there:

- the backend uses the same `contracts` object to register handlers
- the frontend uses the same `contracts` object to create a typed client
- requests and responses stay aligned through shared Zod schemas

## License

MIT
