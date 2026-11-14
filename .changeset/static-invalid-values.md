---
"@rest-rpc/server": patch
---

Reject functions passed to `.static()` in types, which accepted them on routes without defined responses although static values are not called. Type errors now say why a promise, function or stream is not a valid static value instead of reporting a bare `never`. Static routes no longer check at runtime for values that bypass the types.
