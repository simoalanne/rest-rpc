# Example workspace

This folder is a tiny monorepo-style example that showcases the intended
workflow across the packages.

Packages:

- `shared`: defines `apiContract` with `@contract-first-api/core`, including
  status-keyed `responses`, request headers, a custom request body, a stream
  response, and a WebSocket route.
- `backend`: mounts the API contract with `registerRoutes`, uses route-aware
  middleware, and registers WebSocket routes separately.
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

The frontend expects the backend at `http://localhost:3001` by default.
Override it with `VITE_API_URL` when needed.
