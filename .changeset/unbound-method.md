---
"@rest-rpc/core": patch
"@rest-rpc/server": patch
---

Declare `next`, `App.fetch` and the operations of built-in codecs as function-typed properties instead of methods, so destructuring them or passing them on, as in `({ next })` and `fetch: app.fetch`, no longer triggers lint rules such as `unbound-method`.
