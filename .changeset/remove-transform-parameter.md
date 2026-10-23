---
"@rest-rpc/core": minor
"@rest-rpc/server": minor
---

`createOpenApiDocument()` no longer accepts `transformParameter`. Adjust generated parameters in `transformOperation` instead, for example by mapping `operation.parameters`.
