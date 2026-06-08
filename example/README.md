# Example workspace

This folder is a tiny monorepo-style example that showcases the intended
workflow across the packages.

Packages:

- `shared`: defines contracts with `@contract-first-api/core` and exports
  path-based helper types.
- `backend`: mounts the contracts with `initServer`, uses metadata-aware
  middleware, builds request context, and serves JSON plus NDJSON stream routes.
- `frontend`: creates an `ApiClient`, wraps it with the React Query adapter, and
  renders the app inside `QueryClientProvider`.

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
