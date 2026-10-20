---
"@rest-rpc/server": minor
---

Remove the `requestBodyLimit` option. Request bodies read by rest-rpc are no longer size-limited and never respond with `413`; limit them in the host or framework. Add a `body` option to compiled route and catch-all handlers that takes an already parsed body, such as one from a framework's body parser. A passed body skips the body codecs, and is still validated against the route's body schema.
