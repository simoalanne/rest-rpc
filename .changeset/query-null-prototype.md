---
"@rest-rpc/server": patch
---

Parsed query strings are objects without a prototype, so a `__proto__[]` key is an ordinary key instead of replacing the object's prototype, and fields the query doesn't contain read as `undefined` instead of inherited values such as an array's `length`.
