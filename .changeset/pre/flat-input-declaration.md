---
"@rest-rpc/core": minor
---

Route declarations store flat input under `request.input` instead of `request.query` for GET routes and `request.body` otherwise. The stored declaration no longer depends on whether `.input()` is called before or after the HTTP method. `resolveRouteRequest` from `@rest-rpc/core/contract` returns the effective `query`/`body` view used on the wire.
