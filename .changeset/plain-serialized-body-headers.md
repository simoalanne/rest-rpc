---
"@rest-rpc/core": minor
"@rest-rpc/server": patch
---

`serializedBody()` takes its `headers` as a plain object of header names and values instead of any Fetch `HeadersInit`, and `SerializedBody.headers` is that object with lowercase names instead of a Fetch `Headers`. Replace `new Headers(...)` or header tuples passed to it with an object, and read the headers of a serialized body as `serialized.headers["content-type"]` instead of with `get()`.

The `body` handle option is used only when it is defined. Before, passing `body: undefined`, as a framework without a body parser leaves it, skipped reading the request body and validated `undefined` instead.
