---
"@rest-rpc/core": minor
"@rest-rpc/tanstack-query": minor
---

Remove the `strictStatusCodes` route factory option and make its behavior the default. HTTP clients now return only contract-declared responses and throw when a server returns an undeclared status. TanStack Query errors no longer include an undeclared `rawResponse` branch.
