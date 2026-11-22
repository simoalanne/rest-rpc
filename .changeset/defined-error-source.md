---
"@rest-rpc/core": minor
---

`isDefinedError()` takes an optional second argument, a client route or tree or a route or route tree, and narrows the error to their defined errors. A caught error is `unknown`, so `isDefinedError(error)` narrows it only to `RouteError`, and `isDefinedError(error, client.posts.create)` now types its `code` and `data` for that route, or for every route of a tree. The argument is only read for its type.
