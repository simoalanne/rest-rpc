---
"@rest-rpc/core": minor
---

The client passes fetch options to `fetch` as its second argument when the client's `fetchOptions` or the call set any, the way the global `fetch` takes them. Options a `Request` doesn't keep, such as ones a runtime or framework adds to `fetch`, now reach it instead of being dropped. A custom `fetch` receives them too, and `FetchLike` takes them as an optional second parameter. Calls without fetch options still call `fetch(request)`.
