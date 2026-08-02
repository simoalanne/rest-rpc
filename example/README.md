# Example workspace

This folder is a tiny monorepo-style example that showcases the intended
workflow across the packages.

Packages:

- `shared`: defines contracts with `@contract-first-api/core`, including
  status-keyed `responses`, a raw request contract, a stream response, and a
  websocket contract.
- `backend`: mounts the contracts with `initServer`, uses metadata-aware
  middleware, builds request context, and returns contract-typed responses.
- `frontend`: uses the React Query adapter for cacheable HTTP routes and the
  core client for streams and websockets.

Run the backend:

```bash
pnpm --filter @example/backend start
```

Run the frontend:

```bash
pnpm --filter @example/frontend dev
```

The frontend expects the backend at `http://localhost:3001/api` by default.
Override it with `VITE_API_URL` when needed.
