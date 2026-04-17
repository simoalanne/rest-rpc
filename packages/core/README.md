# @contract-first-api/core

`@contract-first-api/core` is the starting point of the workflow. You define your shared contract tree here, and the other packages build on top of it.

## What you do with this package

Use it to:

- describe endpoints with `path`, `method`, `request`, and `response`
- keep request and response types shared between frontend and backend
- generate helper types for specific contract paths
- optionally create repeated CRUD shapes with `createCrudEndpoints`

## Basic usage

```ts
import { initContracts } from "@contract-first-api/core";
import z from "zod";

const { defineContract } = initContracts();

export const contracts = defineContract({
  health: {
    get: {
      method: "GET",
      path: "/health",
      response: z.object({
        status: z.literal("ok"),
        requestId: z.string(),
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
            createdAt: z.string(),
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
        createdAt: z.string(),
      }),
    },
  },
});
```

## Reusing types from the contract

It is common to export path-based helper types so the backend and frontend stay aligned:

```ts
import type {
  ContractApiRequest,
  ContractApiResponse,
  DotPaths,
} from "@contract-first-api/core";

export type ExampleContracts = typeof contracts;
export type ApiPath = DotPaths<ExampleContracts>;

export type ApiRequest<P extends ApiPath> = ContractApiRequest<
  ExampleContracts,
  P
>;

export type ApiResponse<P extends ApiPath> = ContractApiResponse<
  ExampleContracts,
  P
>;
```

That lets you write application code like:

```ts
type CreateTodoInput = ApiRequest<"todos.create">;
type Todo = ApiResponse<"todos.create">;
type Health = ApiResponse<"health.get">;
```

## When to use `createCrudEndpoints`

If several resources follow the same CRUD shape, `createCrudEndpoints` can create a ready-made subtree:

```ts
import { createCrudEndpoints, initContracts } from "@contract-first-api/core";
import z from "zod";

const { defineContract } = initContracts();

const todoSchema = z.object({
  id: z.number(),
  title: z.string(),
});

const todoCreateSchema = z.object({
  title: z.string().min(1),
});

export const contracts = defineContract({
  todos: createCrudEndpoints({
    entity: "todos",
    schema: todoSchema,
    createSchema: todoCreateSchema,
  }),
});
```

## Typical project structure

In practice this package usually lives in a shared workspace package:

- `shared/contracts` defines the contract tree
- backend imports the same tree to register routes
- frontend imports the same tree to build a typed client

That shared-first setup is the intended workflow for this package.
