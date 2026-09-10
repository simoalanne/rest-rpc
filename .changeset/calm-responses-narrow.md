---
"@rest-rpc/core": minor
"@rest-rpc/tanstack-query": minor
---

Replace the client response `declared` discriminator with status-based narrowing. Undeclared responses now preserve the untouched native `Response`, HTTP response declarations are limited to statuses from 100 through 599.
