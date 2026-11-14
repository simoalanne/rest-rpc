---
"@rest-rpc/server": minor
---

`compileRoutes` is renamed `createRouteHandlers`, and its options type `CompileRoutesOptions` is renamed `CreateRouteHandlersOptions`. `createCatchAllHandler` now takes the route tree and the same options instead of compiled routes, in both `@rest-rpc/server` and `@rest-rpc/server/node`: replace `createCatchAllHandler(compileRoutes(routes, options))` with `createCatchAllHandler(routes, options)`.
