---
"@rest-rpc/core": patch
"@rest-rpc/server": patch
---

Inferred response headers keep the types the handler returns instead of their serialized string form, consistent with declared response header schemas. A handler returning `headers: { count: 2 }` now infers `count: 2` instead of `count: "2"`. Handlers may also return boolean header values.

`ResponseHeaders` is renamed to `ResponseHeadersSchema` and mirrors `RequestHeadersSchema`: its output contains scalar header values, including booleans. The value side of both header schemas is `unknown`, so `RequestHeadersSchema` no longer requires an object output.
