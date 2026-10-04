---
"@rest-rpc/core": patch
---

`createOpenApiDocument()` no longer throws for routes without declared responses, such as server routes whose responses are inferred from their handler. These routes now get a `default` response described as "Response inferred from the route handler; not documented.", which documents the operation without claiming a status or body.
