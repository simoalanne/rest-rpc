---
"@rest-rpc/server": patch
---

Re-export the rest of `@rest-rpc/core` except `route` from `@rest-rpc/server`, so server code and its tests import only `@rest-rpc/server`: `clientInterceptor()`, `extractContract()` and the `AbsolutePath`, `ApiClientFor`, `ApiClientRouteValue`, `BodyDeserializer`, `BodySerializer`, `BuiltInBodyCodec`, `ClientHeaders`, `ClientInterceptor`, `Contract`, `FetchLike`, `FetchOptions`, `IncomingBody`, `InferClientStreamData`, `ResponseOptions`, `RouteDefinition` and `SseResponse` types.
