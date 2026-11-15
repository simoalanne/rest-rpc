---
"@rest-rpc/server": patch
---

The Node adapter streams `FormData` response bodies instead of reading each into memory, files included. They are sent without a `content-length`.
