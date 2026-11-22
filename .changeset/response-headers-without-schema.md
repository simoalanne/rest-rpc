---
"@rest-rpc/server": minor
---

A defined response or error without a headers schema sends the headers the handler and middleware set. They used to be dropped, so a `content-type` set with `respond()`, or a header such as `cache-control` added by middleware, was not sent on routes that define their responses. With a headers schema, its output is still what's sent, so a schema that strips unknown keys sends only the headers it declares.
