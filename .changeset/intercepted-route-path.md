---
"@rest-rpc/core": patch
"@rest-rpc/server": patch
---

Type the `path` of an intercepted route as always set. Client and server interceptors receive the path resolved from the route tree, also for routes that take their path from their key, so `route.path` no longer needs an `undefined` check.
