---
"@rest-rpc/core": minor
"@rest-rpc/server": minor
---

A Fetch `Response` a handler returns is sent as it is, after middleware, without response validation or codecs, on Fetch and Node. Middleware receives it as the body of the envelope `next()` resolves to, with its status, headers and cookies, and the envelope's fields are sent. `.response(raw())` declares such a route, such as in a contract, and must be the route's only response. OpenAPI documents it as a default response. `.static(new Response(...))` sends a clone for every request, and `respond()` rejects a `Response` body.
