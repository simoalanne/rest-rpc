---
"@rest-rpc/server": patch
"@rest-rpc/tanstack-query": patch
---

Editors display handler `errors` and `context`, local client options and results, and TanStack Query option results as their resolved types instead of internal type names. The `route` of `InferServerRequest` no longer has `handler`, `context` or `initialContext`, matching the route handlers receive.
