---
"@rest-rpc/core": minor
"@rest-rpc/tanstack-query": minor
---

Align TanStack Query helpers with the Fetch client and TanStack Query APIs. Query and streamed-query helpers now accept one options object with a `request` field, infinite queries map TanStack page parameters to route requests with a `request` callback, and `skipToken` consistently replaces `request`. Route helpers expose explicit `queryKey()` and `mutationKey()` methods, generated mutation options use the route mutation key by default, and query keys preserve request input unchanged. Helpers also preserve dynamic global-header inference and route-specific Fetch options, while mutations accept caller-managed cancellation signals.
