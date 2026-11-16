---
"@rest-rpc/server": minor
---

Remove the `onError` route option and the `notFound` option of both `createApp`s. Report errors from an interceptor instead, where `next()` rejects with them, and send a custom response for unmatched requests from an interceptor, which receives no `route` for them.
