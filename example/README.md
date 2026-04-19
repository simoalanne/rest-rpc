# Example workspace

This folder is a tiny monorepo-style example that showcases the intended workflow across the packages.

Packages:

- `shared`: exports one small contract tree
- `backend`: mounts the contracts with `createExpressRouter`, uses metadata-aware middleware, and builds request context from the same shared contract data
- `frontend`: React app using `ApiClient` through the React Query adapter, including custom adapter transforms and Suspense

Run the backend:

```bash
pnpm --filter @example/backend start
```

Run the frontend:

```bash
pnpm --filter @example/frontend dev
```

The frontend expects the backend at `http://localhost:3001/api` by default.
