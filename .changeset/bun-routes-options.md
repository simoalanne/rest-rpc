---
"@rest-rpc/server": patch
---

Run interceptors for `OPTIONS` requests to `app.routes`, as `app.fetch` does, so an interceptor answers CORS preflights when Bun serves `app.routes` without `app.fetch`. Bun answered them with its own `404` before. A preflight no interceptor answers is sent `NOT_FOUND`.
