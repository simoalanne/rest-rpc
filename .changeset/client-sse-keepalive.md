---
"@rest-rpc/core": patch
---

The client skips event stream frames without data, such as keepalive comments, and drops an incomplete last frame, instead of ending the stream with an error.
