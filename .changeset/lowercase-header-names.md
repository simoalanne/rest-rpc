---
"@rest-rpc/core": minor
"@rest-rpc/server": minor
---

Header names with uppercase letters are a type error in `.headers()`, response and error `headers` schemas, `routeError()` and `respond()` headers. Received header names are lowercase, so those names never matched: required request headers failed validation, optional ones were always `undefined`, and response headers were typed but missing on the client. `globalHeaders` and `additionalHeaders` are not checked.
