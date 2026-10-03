---
"@rest-rpc/core": patch
---

The route builder no longer repeats at runtime the checks its types already enforce: selecting a method twice, mixing flat input with request segments, mixing plain output with response envelopes, and changing a route after attaching a handler.
