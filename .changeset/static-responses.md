---
"@rest-rpc/server": minor
---

Add `.static(value)`, which completes a route with the same response for every request, serialized once when the routes are compiled. Compiled Fetch routes have it as `staticResponse`, and `App.routes` entries are a function or that `Response`.
