---
"@rest-rpc/core": minor
"@rest-rpc/server": minor
---

Body codecs list the media types they handle in `mediaTypes` instead of a `match` function. A string matches one lowercase base media type exactly, and a regular expression matches a family, such as `/\+json$/`. Exact strings take precedence over patterns, which are tested with custom codecs before the defaults. Codecs are indexed once per client and per `compileRoutes` call, so exact media types are found with a map lookup.

Serializers return the serialized body instead of `{ body, headers, contentType }`. A plain body is sent with the selected content type. `serializedBody(body, headers)` sends a body with its own headers; without a `content-type` header, the Fetch `Request` or `Response` sets one for the body, such as `multipart/form-data` with its generated boundary for `FormData`. A `content-type` header must keep the selected base media type. `SerializedBody` is now the type returned by `serializedBody()`, and `BodyValue` is the union of plain bodies.

Add `bodyCodec(mediaTypes, operations)`, which creates a codec from a media type, a pattern, or a list of both. A codec must have `serialize`, `deserialize`, or both. `BodyCodec` and `BodyDeserializer` no longer take a source type parameter; deserializers receive the Fetch `Request` or `Response`.
