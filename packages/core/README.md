# @contract-first-api/core

`@contract-first-api/core` is the starting point of the workflow. You define your shared contract tree here, and the other packages build on top of it.

## What you do with this package

Use it to:

- describe contracts with `path`, `method`, `request`, `response`, and optional `meta`
- keep request and response types shared between frontend and backend
- create path-based helper types from the same tree
- inspect or transform the tree when you need advanced behavior

## Basic usage

```ts
import { initContracts } from "@contract-first-api/core";
import z from "zod";

type ContractMeta = {
  requiresAuth?: boolean;
  auditLabel?: string;
};

const { defineContractTree, mergeContracts } = initContracts<ContractMeta>();

const healthContracts = defineContractTree({
  health: {
    get: {
      method: "GET",
      path: "/health",
      meta: {
        auditLabel: "health.get",
      },
      response: z.object({
        status: z.literal("ok"),
        requestId: z.string(),
      }),
    },
  },
});

const todoContracts = defineContractTree({
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
        createdAt: z.string(),
      }),
    },
  },
});

export const contracts = mergeContracts(healthContracts, todoContracts);
```

## Common pattern

It is common to export helper types from the shared contract package so the backend and frontend stay aligned:

```ts
import type {
  ContractApiRequest,
  ContractApiResponse,
  DotPaths,
} from "@contract-first-api/core";

export type ExampleContracts = typeof contracts;
export type ApiPath = DotPaths<ExampleContracts>;
export type ApiMeta = ContractMeta;

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
type Meta = ApiMeta;
```

## Tree utilities

The package also exports a few small utilities for advanced transforms:

- `flattenContractTree(contracts)` to turn the tree into a flat list of contracts with `keySegments`
- `mapContractTree(contracts, mappingFn)` to preserve the tree shape while mapping every contract
- `mapObjectValues(tree, isLeaf, mappingFn)` for generic tree transforms

## Typical project structure

In practice this package usually lives in a shared workspace package:

- `shared/contracts` defines the contract tree
- backend imports the same tree to register routes
- frontend imports the same tree to build a typed client

That shared-first setup is the intended workflow for this package.
