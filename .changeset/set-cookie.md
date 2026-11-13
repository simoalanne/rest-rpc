---
"@rest-rpc/core": minor
"@rest-rpc/server": minor
---

Add `cookies` to `respond()` options, middleware responses and thrown errors. Each value is sent as its own `Set-Cookie` header. Fetch client results and `RouteError`s have the received values as `cookies` instead of a joined `set-cookie` header. Browsers hide `Set-Cookie` from `fetch`, so `cookies` is empty there.
