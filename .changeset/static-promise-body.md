---
"@rest-rpc/server": patch
---

`.static()` rejects a `respond()` result with a promise body, which is not awaited, like it rejects a promise value.
