---
"@rest-rpc/core": minor
"@rest-rpc/server": minor
---

A `serializedBody()` without a `content-type` header is sent with the selected content type, on the client and the server. Before, the runtime chose one from the body, such as `text/plain;charset=UTF-8` for a string, which could contradict the route's content type. A `FormData` body is always sent with the `multipart/form-data` content type the runtime generates with its boundary, so the default multipart codec returns it as is instead of wrapping it in `serializedBody()`.
