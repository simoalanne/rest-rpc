---
"@rest-rpc/server": minor
"@rest-rpc/nest": patch
---

Add `serializeHttpRouteResult`, which serializes a route result body with the matching body codec and merges codec and result headers, and `createAdapterApi` with its `AdapterApi` type, which types `route` and `implement` for an adapter's handler fields. All adapters use them. Node, Express, Fastify and Nest now throw "No serializer for declared content-type" when no codec matches a response body, as Fetch and Hono already did.
