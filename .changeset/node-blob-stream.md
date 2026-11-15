---
"@rest-rpc/server": patch
---

The Node adapter streams `Blob` response bodies, such as from `fs.openAsBlob()`, instead of reading each into memory, and sends their size as `content-length`. Static routes with a `Blob` body stream it for each response too.
