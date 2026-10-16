---
"@rest-rpc/node": patch
---

A stream chunk that fails response validation no longer reaches `responseValidationErrorHandler`, which could not write a response to the already destroyed stream. The error now propagates like other write failures: the Node route handler rejects.
