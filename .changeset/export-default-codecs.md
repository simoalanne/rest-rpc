---
"@rest-rpc/core": minor
"@rest-rpc/server": minor
---

Export the built-in body codecs from `@rest-rpc/core` and `@rest-rpc/server` as `jsonCodec`, `urlEncodedCodec`, `formDataCodec`, `textCodec` and `binaryCodec`, so a custom codec can call one for the values it doesn't handle. Their operations are both defined and typed with what they return, such as `Promise<FormData>` from `formDataCodec.deserialize()`.

`IncomingBody` has a `formData()` method, which the Node server implements too, so a codec reads a multipart body with `await body.formData()` on every runtime. An object implementing `IncomingBody` must add it.
