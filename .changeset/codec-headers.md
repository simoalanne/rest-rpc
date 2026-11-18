---
"@rest-rpc/core": minor
"@rest-rpc/server": minor
---

Body codecs receive headers instead of a content type: `serialize(value, headers)` gets the outgoing headers with the selected `content-type`, and `deserialize(body, headers)` the received ones, with lowercase names. Headers a codec returns with `serializedBody()` replace the handler's and the call's, `content-type` parameters included, so a codec can add a filename to `content-disposition`. Before, a handler's headers won over them. The client chooses a request's format from its `content-type` wherever it is set, the call's over `additionalHeaders` over `globalHeaders`. Before, a `content-type` in either was ignored and the body sent as JSON, although `globalHeaders` made the route's header optional. A Node request body can be read once, and a second read rejects as on Fetch instead of returning the same body or hanging.
