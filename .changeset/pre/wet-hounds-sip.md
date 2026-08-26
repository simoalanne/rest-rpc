---
"@rest-rpc/express": minor
"@rest-rpc/fastify": minor
"@rest-rpc/hono": minor
"@rest-rpc/next": minor
"@rest-rpc/server": minor
"@rest-rpc/web": minor
---

Remove routes function and replace it conseptually by allowing to stack router/route calls excluding web/next which cannot do that due to having different implementation
