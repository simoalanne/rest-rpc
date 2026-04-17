# @contract-first-api/express

`@contract-first-api/express` connects a shared contract tree to an Express app. You give it your contracts and a matching service object, and it registers the routes for you.

## What you do with this package

Use it to:

- mount routes from a shared contract tree
- validate `params`, `query`, and `body` with the Zod schemas from the contracts
- keep backend handler inputs and outputs typed from the same source as the frontend
- optionally add per-request context

## Basic usage

```ts
import { createExpressRouter, initServices } from "@contract-first-api/express";
import { contracts } from "@example/shared";
import express from "express";

type RequestContext = {
  requestId: string;
};

const app = express();
app.use(express.json());

const { defineService } = initServices(contracts).withContext<RequestContext>();

const services = {
  health: defineService("health", {
    get({ context }) {
      return {
        status: "ok",
        requestId: context.requestId,
      };
    },
  }),
  todos: defineService("todos", {
    list() {
      return { items: [] };
    },
    create({ title }) {
      return {
        id: crypto.randomUUID(),
        title,
        createdAt: new Date().toISOString(),
      };
    },
  }),
};

createExpressRouter({
  app,
  contracts,
  services,
  routePrefix: "/api",
  createContext: () => ({
    requestId: crypto.randomUUID(),
  }),
});
```

## How handlers are shaped

Each service function receives one object:

- request fields from the contract
- `context` from `createContext`

For example:

```ts
create({ title }) {
  return {
    id: `todo-${todos.length + 1}`,
    title,
    createdAt: new Date().toISOString(),
  };
}
```

For routes with no request schema, you can still access `context`:

```ts
get({ context }) {
  return {
    status: "ok",
    requestId: context.requestId,
  };
}
```

## What happens automatically

When you call `createExpressRouter`:

- every contract route is registered on the Express app
- incoming `body`, `query`, and `params` are validated against the contract
- validated values are merged into the handler input object
- a failed validation returns `400`
- handler results are sent as JSON when the contract has a `response`

## Common setup pattern

A typical backend flow looks like this:

1. Define contracts in a shared package.
2. Call `initServices(contracts)` to type the service tree.
3. Implement handlers with `defineService`.
4. Pass `app`, `contracts`, and `services` into `createExpressRouter`.
5. Add a `routePrefix` like `/api` so the frontend client can target one API base URL.

If you already have an Express app with middleware, keep that setup as-is and call `createExpressRouter` after the middleware you want the routes to use.
