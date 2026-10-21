---
"@rest-rpc/server": minor
---

Routes without a body schema ignore the request body and its `Content-Type` instead of rejecting a request that has one with `415`. Their handlers receive `contentType` as `undefined`, and its type is narrowed to `undefined`.
