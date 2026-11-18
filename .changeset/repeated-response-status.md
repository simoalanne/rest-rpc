---
"@rest-rpc/core": patch
---

A `.response()` for a status the route already defines is a type error. So is a `.response()` status outside 200 to 299. Before, both only threw when the route was defined.
