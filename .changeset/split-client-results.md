---
"@rest-rpc/core": minor
"@rest-rpc/tanstack-query": minor
---

`InferClientRequest` accepts the type of the client's `globalHeaders` as a second argument to make guaranteed headers optional. `InferClientRequest` infers `undefined` instead of `never` for routes without request input, matching what the route call accepts.

Replace the TanStack Query type helpers with the core names. `@rest-rpc/tanstack-query` re-exports `InferClientRequest` and `InferClientStreamData`. Migrate `InferQueryData` → `InferClientResponse`, `InferQueryError` → `InferClientError`, `InferMutationVariables` → `InferClientRequest`, `InferInfiniteQueryData<Route, PageParam>` → `InfiniteData<InferClientResponse<Route>, PageParam>`, and `InferStreamedQueryData<Route>` → `Array<SseEvent<InferClientStreamData<Route>>>`.
