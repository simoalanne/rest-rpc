---
"@rest-rpc/server": minor
---

Remove the `prefix` option from `compileRoutes`. Declare path prefixes in the routes with `.prefix()` instead, or pass the path a catch-all handler is mounted at as the new per-request `mountPath` option. The Node adapter reads `req.originalUrl` when a framework such as Express sets it.
