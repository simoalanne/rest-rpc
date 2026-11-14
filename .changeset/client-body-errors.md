---
"@rest-rpc/core": patch
---

The client passes response bodies to codecs directly. A response body that fails while it is read now rejects like a body that cannot be decoded, with the read error as `cause`.
