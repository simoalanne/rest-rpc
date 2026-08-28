---
"@rest-rpc/express": patch
"@rest-rpc/fastify": patch
"@rest-rpc/hono": patch
"@rest-rpc/server": patch
---

rename server registerRoutes to splitRouteImplementations to decribe its role more accurately.
Allow onRequestValidationError hook to return undefined to match the consistency of the other hooks.
