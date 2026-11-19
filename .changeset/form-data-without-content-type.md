---
"@rest-rpc/server": minor
---

Accept `FormData` request bodies without a declared content type. A route whose headers schema declares no `content-type` now decodes `multipart/form-data` as well as JSON, so `route.body(type<FormData>())` works with a client that sends `FormData` and no `content-type` header, which Fetch sets with the generated boundary. Such routes no longer answer multipart requests with `415`, so a route that shouldn't take `FormData` rejects it with its body schema.
