# Example workspace

This folder is a tiny monorepo-style example that pressure-tests the current library API.

Packages:

- `shared`: exports one small contract tree
- `backend`: mounts the contracts with `createExpressRouter`
- `frontend`: React app using `ApiClient` through the React Query adapter

Run the backend:

```bash
pnpm --filter @example/backend start
```

Run the frontend:

```bash
pnpm --filter @example/frontend dev
```

The frontend expects the backend at `http://localhost:3001/api` by default.
