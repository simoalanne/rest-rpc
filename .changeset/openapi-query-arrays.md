---
"@rest-rpc/core": patch
---

OpenAPI documents array query parameters as `name[]` with `style: form` and `explode: true`, the way the client sends them and the server reads them.
