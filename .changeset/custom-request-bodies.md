---
"@rest-rpc/core": minor
"@rest-rpc/server": minor
---

Use `body(schema, { contentType })` and `input(schema, { contentType })` for every request body encoding, removing the form and multipart wrapper methods. An omitted body content type is normalized to `application/json`. Client calls select among multiple declared content types through the Fetch options argument. Server-first body calls always provide that option for non-JSON content types.
