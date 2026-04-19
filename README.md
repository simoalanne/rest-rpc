# contract-first-api

`contract-first-api` is a small TypeScript toolkit for defining an API contract once and reusing it across your stack.

The typical workflow is:

1. Define a contract tree with `@contract-first-api/core`.
2. Mount it on Express with `@contract-first-api/express`.
3. Create a typed runtime client with `@contract-first-api/api-client`.
4. Optionally wrap that client with `@contract-first-api/react-query`.

The same contract tree can also carry metadata, so runtime middleware, request context creation, and client-side transforms can all read from one shared definition.

## Packages

- `@contract-first-api/core`: define contracts, metadata, and shared request/response types
- `@contract-first-api/express`: register contracts as Express routes with typed services and middleware
- `@contract-first-api/api-client`: create a typed runtime client from the contract tree
- `@contract-first-api/react-query`: turn the typed client into React Query hooks and cache helpers

## Install

```bash
pnpm add @contract-first-api/core
```

Add the other packages you need:

```bash
pnpm add @contract-first-api/express @contract-first-api/api-client @contract-first-api/react-query
```

## Basic flow

```ts
import { initContracts } from "@contract-first-api/core";
import z from "zod";

type ContractMeta = {
  requiresAuth?: boolean;
  auditLabel?: string;
};

const { defineContract } = initContracts<ContractMeta>();

export const contracts = defineContract({
  health: {
    get: {
      method: "GET",
      path: "/health",
      meta: {
        auditLabel: "health.get",
      },
      response: z.object({
        status: z.literal("ok"),
      }),
    },
  },
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
      meta: {
        requiresAuth: true,
        auditLabel: "todos.create",
      },
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

From there, the backend, client, and optional React Query layer all reuse the same contract tree and stay aligned on request and response shapes.

## Docs

- [Root example workspace](./example/README.md)
- [Core package](./packages/core/README.md)
- [Express package](./packages/express/README.md)
- [API client package](./packages/api-client/README.md)
- [React Query package](./packages/react-query/README.md)

## License

MIT
