---
"@rest-rpc/server": minor
---

Interceptors' `next()` rejects with every error thrown after it, `RouteError`s included, with the status, `data` and headers they're sent with, and `NOT_FOUND` for unmatched requests. Interceptors send errors by throwing. `errorResponse()` and `writeErrorResponse()` take any thrown value and are what the app sends with, so an interceptor catching with them turns errors into responses for the ones before it. `onError()` creates an interceptor that reports errors, response bodies that fail while they stream included. `createRouteHandlers` and `createCatchAllHandler` take `interceptors` too.
