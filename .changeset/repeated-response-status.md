---
"@rest-rpc/core": patch
---

A `.response()` for a status the route already defines is a type error. Before, it only threw when the route was defined.
