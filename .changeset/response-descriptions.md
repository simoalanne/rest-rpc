---
"@rest-rpc/core": minor
"@rest-rpc/server": minor
---

`.openAPI()` no longer accepts `responses`. Describe a response with the `description` option of `.response()`, `.output()`, `.streamResponse()` or `.streamOutput()` instead, for example `.response(204, undefined, { description: "Todo deleted." })`. OpenAPI-only response headers are removed: document typed headers with the response `headers` option, or add other headers with `transformOperation`. `.streamResponse()` now accepts `headers`, so declared stream responses can type and validate their headers like other responses. `OutputOptions`, `StreamResponseOptions` and `StreamOutputOptions` are exported.

Response headers now use one name. Handlers return them as `headers` instead of `responseHeaders`, for example `{ status: 201, body, headers: { location } }`. Client results expose the typed declared headers as `headers` instead of `responseHeaders`, and the Fetch `Headers` object moves from `headers` to `rawHeaders`.
