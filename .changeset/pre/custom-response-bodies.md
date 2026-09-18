---
"@rest-rpc/core": minor
"@rest-rpc/server": minor
---

Declare responses with `response(status, schema?, options?)`, where content type and typed headers are options and an omitted schema means no body. Store every response declaration as `{ body, contentType, headers? }`, normalizing an omitted body content type to `application/json` and `streamResponse()` to `application/x-ndjson`; no-body responses use `body: undefined`. Remove the custom body wrapper types, `isStandardSchema()`, and `customStreamResponse()`. Fetch clients parse and validate non-stream custom responses, with an optional `bodyParser` client setting for custom decoding.
