---
"@rest-rpc/core": minor
---

Replace the client's `baseUrl` option with `origin` and `mountPath`, which are both optional. A browser app served from the same origin as its routes needs no options, and `mountPath` is the same as the server's. Outside browsers, a call without `origin` rejects with a `TypeError`. A trailing slash of `origin` is ignored, and an `origin` with a path throws a `TypeError` when the client is created. Migrate `baseUrl: "https://api.example.com/api"` to `origin: "https://api.example.com", mountPath: "/api"`.

The client's `fetch` option always receives a Fetch `Request`, so its type is `(request: Request) => Promise<Response>`. Before, it received a URL and `RequestInit`. A Fetch app's `fetch` can now serve a client in the same process, such as `fetch: app.fetch` in tests.
