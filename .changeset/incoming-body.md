---
"@rest-rpc/core": minor
"@rest-rpc/server": minor
---

Body deserializers receive an `IncomingBody` and the complete content type, as `deserialize(body, contentType)`, like serializers receive the content type. `IncomingBody` has `text()`, `json()`, `arrayBuffer()`, `blob()` and `body`, which Fetch requests and responses already have, so codecs that only use these work unchanged. Codecs that call other `Request` or `Response` members, such as `formData()`, must read the body with these instead, such as `new Response(await body.arrayBuffer(), { headers: { "content-type": contentType } }).formData()`. A codec used only on one side can no longer treat its source as a `Request` or `Response`.
