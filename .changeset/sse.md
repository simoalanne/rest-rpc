---
"@rest-rpc/core": minor
"@rest-rpc/server": minor
---

Make server-sent events usable behind proxies and with other data formats. The client parses event streams following the SSE spec: LF, CRLF and CR line endings, an optional space after the colon, multi-line data, persisted ids and digit-only `retry` values. Stream responses are sent with `cache-control: no-cache` by default, so proxies don't cache or buffer them. `sseFormat()` and the `sse: { format }` option on the server and the client set the data format of events, JSON by default. The server's `sse` option also takes `keepAlive` and `initialComment`, which `respond(stream, { sse })` overrides per stream.
