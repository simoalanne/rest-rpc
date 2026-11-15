---
"@rest-rpc/core": minor
---

`BodyValue` types the chunks of streams a serializer returns, as `ReadableStream<Uint8Array>` or `AsyncIterable<string | Uint8Array>`. Other chunks already failed when the response was sent, after its headers, and are now a type error in custom codecs.
