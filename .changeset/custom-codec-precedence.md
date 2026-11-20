---
"@rest-rpc/core": minor
"@rest-rpc/server": minor
---

Custom codecs take precedence over the built-in ones for every media type they match, patterns included. A codec such as `bodyCodec(/.*/, ...)` now also handles `application/json`, `application/x-www-form-urlencoded` and `multipart/form-data`, which used to stay with the built-in codecs because they list them as strings. Within the custom codecs, a media type listed as a string is still selected before patterns.

A codec may now send another base media type in the `content-type` of a `serializedBody()` instead of throwing. The receiving side decodes the body with the codec of the content type it receives, while route types and OpenAPI documents still show the declared one.
