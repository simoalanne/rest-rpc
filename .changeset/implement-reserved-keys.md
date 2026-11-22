---
"@rest-rpc/server": minor
---

`implement()` rejects a contract tree whose top-level keys include `use` or `$context` with a type error. The implementer's methods use those names, so such a route or group used to be replaced by the method.
