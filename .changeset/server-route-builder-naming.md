---
"@rest-rpc/server": minor
---

Rename `serverFirstRoute` to `serverRoute` and the `ServerRouteBuilder` type to `PublicServerRouteBuilder`. Remove the unused `ServerFirstResponseKind` and `ServerFirstRouteResponseKind` types. The server route builder is now a subclass of the core route builder instead of methods patched onto its prototype.
