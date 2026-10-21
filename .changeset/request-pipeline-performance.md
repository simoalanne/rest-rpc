---
"@rest-rpc/core": patch
"@rest-rpc/server": patch
---

Reduce per-request work in compiled routes. Route path params are parsed once per route, request headers are copied only for routes with a headers schema, response headers are stringified once, and `type()` without a mapper validates synchronously. Unencoded query strings are parsed without `URLSearchParams`, stacked request schemas validate synchronously when every schema does, values derived from a route declaration are computed once per route, and `application/json` responses without headers are sent with `Response.json`.
