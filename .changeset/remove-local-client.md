---
"@rest-rpc/server": minor
---

Remove `createLocalClient()` and the `LocalClient` type. To call an app in process with the same behavior as over HTTP, such as in tests, pass its `fetch` to `createClient(routes, { fetch: app.fetch })`. `createClient` and `ApiClientOptions` are now exported from `@rest-rpc/server` too. To call one route without HTTP, use `call()`.
