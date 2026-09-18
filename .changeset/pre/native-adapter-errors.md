---
"@rest-rpc/server": minor
"@rest-rpc/express": minor
"@rest-rpc/fastify": minor
"@rest-rpc/fetch": minor
"@rest-rpc/hono": minor
"@rest-rpc/nest": minor
"@rest-rpc/node": minor
---

Use each framework's native error-handling flow for request and response validation failures. Replace the shared server error-handler API with exported validation error classes and adapter-specific hooks allowing for more native feeling error handling.
