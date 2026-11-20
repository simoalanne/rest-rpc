---
"@rest-rpc/core": minor
"@rest-rpc/server": minor
---

Server-Sent Events and error responses never use body codecs, on either side. The server writes event streams without passing them through the codecs, and the client reads error bodies with the built-in codecs only, so a custom codec that matches `application/json`, such as a catch-all pattern, no longer breaks defined errors.
