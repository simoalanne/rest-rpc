---
"@rest-rpc/core": minor
"@rest-rpc/server": minor
"@rest-rpc/tanstack-query": minor
---

Client calls may omit a `query` or `headers` object without required fields, a `body` whose schema accepts `undefined` on routes with one body media type, and a request without required fields. Before, only headers could be omitted, and only inside a passed request. TanStack Query `request` options and the local client follow the same rules, and local calls receive an omitted `query` or `headers` as `{}`, as over HTTP.
