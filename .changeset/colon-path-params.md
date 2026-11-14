---
"@rest-rpc/core": minor
"@rest-rpc/server": minor
---

Path params are written only as `:name`. `{name}` segments are no longer params, and the `paramSyntax` compile option is removed: compiled paths keep `:name`, and OpenAPI documents still use `{name}`.
