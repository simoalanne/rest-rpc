---
"@rest-rpc/tanstack-query": patch
---

`queryOptions()` and `infiniteQueryOptions()` with a request are accepted by `useSuspenseQuery()` and `useSuspenseInfiniteQuery()`. Their `queryFn` was typed as possibly `skipToken`, which the suspense hooks reject. Options with a `skipToken` request keep that type, so the suspense hooks still reject them.
