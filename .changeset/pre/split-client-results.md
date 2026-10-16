---
"@rest-rpc/core": minor
"@rest-rpc/tanstack-query": minor
---

Add `InferClientSuccess` and `InferClientError` to `@rest-rpc/core`, which split a route's client result into its declared 2xx and non-2xx responses. The core `InferClientError` contains only returned responses, not thrown `HttpError` or `Error` values. `InferClientRequest` accepts the type of the client's `globalHeaders` as a second argument to make guaranteed headers optional. `InferClientRequest` infers `undefined` instead of `never` for routes without request input, matching what the route call accepts.

Replace the TanStack Query type helpers with the core names. `@rest-rpc/tanstack-query` re-exports `InferClientSuccess`, `InferClientRequest`, `InferClientStreamData`, and `HttpError`, and exports an `InferClientError` that also includes `HttpError` and `Error`, matching the `error` of generated options. Migrate `InferQueryData` → `InferClientSuccess`, `InferQueryError` → `InferClientError`, `InferMutationVariables` → `InferClientRequest`, `InferInfiniteQueryData<Route, PageParam>` → `InfiniteData<InferClientSuccess<Route>, PageParam>`, and `InferStreamedQueryData<Route>` → `Array<SseEvent<InferClientStreamData<Route>>>`.
