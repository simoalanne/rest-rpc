# @contract-first-api/express

`@contract-first-api/express` connects a shared contract tree to an Express app. You give it your contracts and a matching service object, and it registers the routes for you.

## What you do with this package

Use it to:

- mount routes from a shared contract tree
- validate `params`, `query`, and `body` with the Zod schemas from the contracts
- keep backend handler inputs and outputs typed from the same source as the frontend
- add typed request context
- read contract metadata inside middlewares and `createContext`

## Basic usage

```ts
import { createExpressRouter, initServices } from "@contract-first-api/express";
import { contracts } from "@example/shared";
import express from "express";

type ContractMeta = {
  requiresAuth?: boolean;
  auditLabel?: string;
};

type RequestContext = {
  requestId: string;
  viewerId?: string;
};

const app = express();
app.use(express.json());

const { defineService, defineMiddleware } = initServices<
  typeof contracts,
  ContractMeta,
  RequestContext
>();

declare global {
  namespace Express {
    interface Request {
      viewerId?: string;
    }
  }
}

const authMiddleware = defineMiddleware((req, _res, next) => {
  if (req.contract.meta?.requiresAuth) {
    req.viewerId = "viewer-123";
  }

  next();
});

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
    create({ title, context }) {
      console.log("viewer", context.viewerId);
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
  middlewares: [authMiddleware],
  createContext: (req) => ({
    requestId: `${req.contract.meta?.auditLabel ?? "route"}:${crypto.randomUUID()}`,
    viewerId: req.viewerId,
  }),
});
```

## How it works

Each service function receives one object:

- request fields from the contract
- `context` from `createContext`

## Middleware and validation

When you call `createExpressRouter`:

- every contract route is registered on the Express app
- incoming `body`, `query`, and `params` are validated against the contract
- validated values are merged into `req.validatedRequest`
- the current contract is attached to `req.contract`
- custom middlewares run after validation and before `createContext`
- a failed validation throws `RequestValidationError` with `statusCode = 400`
- static routes are registered before parameter routes when paths overlap

## Common setup pattern

A typical backend flow looks like this:

1. Define contracts in a shared package.
2. Call `initServices<typeof contracts, ContractMeta, RequestContext>()` to type the service helpers.
3. Implement handlers with `defineService`.
4. Add metadata-aware Express middleware with `defineMiddleware` when needed.
5. Pass `app`, `contracts`, and `services` into `createExpressRouter`.
6. Add a `routePrefix` like `/api` so the frontend client can target one API base URL.

If you already have an Express app with middleware, keep that setup as-is and call `createExpressRouter` after the middleware you want the routes to use.
