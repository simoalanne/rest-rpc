---
"@rest-rpc/server": minor
---

`onError` receives a thrown defined error as it was thrown, instead of a copy with the defined status, validated `data` and headers, and the thrown error as `cause`. Its `cause` is now the one passed when throwing, so `errors.CODE({ cause })` reaches `onError` as `error.cause`. The response still uses the definition. A `new RouteError(code)` for a code the route defines keeps its own status in `onError`, which defaults to 400, while the defined status is sent. Defined errors with synchronous schemas are now resolved without a promise, and errors received from `call()` and the local client have no `cause`, like errors received over HTTP.
