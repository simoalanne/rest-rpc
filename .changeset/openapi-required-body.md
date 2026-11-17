---
"@rest-rpc/core": patch
---

OpenAPI documents a defined request body as required. Before, `requestBody.required` was never set, so generated SDKs made every body optional.
