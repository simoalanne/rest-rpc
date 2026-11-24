---
"@rest-rpc/core": patch
---

`createOpenApiDocument()` leaves `$schema` out of converted schemas, since the document's dialect is `jsonSchemaDialect`.
