---
"@rest-rpc/core": minor
"@rest-rpc/server": minor
---

Remove `jsonQuery(schema)` support. This allowed to sent json via query string, but added unnecessary complexity to the client and server.
