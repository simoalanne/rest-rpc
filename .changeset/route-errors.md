---
"@rest-rpc/core": minor
"@rest-rpc/server": minor
"@rest-rpc/tanstack-query": minor
---

Separate errors from responses. Routes declare errors with `.error(code, options)` or a definition from `routeError(code, options)`, and handlers and middleware throw them, using the declared classes they receive as `errors`. Errors are sent as JSON `{ code, message, data? }` with the declared status and headers. Declaring errors does not leave inferred response mode, and reusable middleware can require errors through its type argument. Extracted contracts keep each declared error's status.

`.response()` and inferred handler statuses are limited to 2xx. Migrate `.response(schema, { status: 404 })` with a returned `{ status: 404, body }` to `.error("CODE", { status: 404, data: schema })` with a thrown `new errors.CODE(body)`.

Client calls resolve with success envelopes and reject with a `RouteError` whenever a response arrived: the declared error when the body's `code` is declared with the received status, and `UNKNOWN_ERROR` for every other response outside the contract, with the decoded body as `data`. Failures without a response reject with the original error. `HttpError` and `InferClientSuccess` are removed, and `InferClientError` infers the route's `RouteError`s. Client calls return a `ClientPromise`, and `safe()` resolves one to a typed `[error, data]` tuple. `call()` and the local client reject the same way.

Request validation, body decoding, media type and response validation failures are sent as the built-in `REQUEST_VALIDATION_FAILED`, `MALFORMED_REQUEST_BODY`, `UNSUPPORTED_MEDIA_TYPE` and `RESPONSE_VALIDATION_FAILED` errors. `RequestValidationError`, `ResponseValidationError` and the `requestValidationErrorHandler` and `responseValidationErrorHandler` options are removed. The `onError` option of `compileRoutes` and `createApp` observes sent errors without changing the response. `createApp` sends other thrown errors as `INTERNAL_SERVER_ERROR` and unmatched requests as `NOT_FOUND` by default.

TanStack Query options reject with the client's errors instead of response envelopes. `@rest-rpc/tanstack-query` re-exports `RouteError`, `InferClientResponse` and the core `InferClientError`.

OpenAPI documents declared errors as JSON responses keyed by status.
