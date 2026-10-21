---
"@rest-rpc/server": minor
---

Handlers no longer receive `lastEventId`, and `call()` no longer accepts a `lastEventId` option. Read the `Last-Event-ID` header with a `.headers()` schema, or seed the context with it from the host.
