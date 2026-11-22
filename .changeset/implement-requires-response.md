---
"@rest-rpc/server": minor
---

`implement()` requires a contract route to define its responses. A contract route without `.response()` has no handler to infer its response from, so its handler used to accept any value and the client typed the call as `never`. Its `handler()` is now a type error that says to add `.response()`, which can be a response without a body, such as `.response({ status: 204 })`.
