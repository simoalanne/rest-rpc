---
"@rest-rpc/server": patch
---

Compiled routes use params a router set as `request.params`, such as Bun's router and Express, instead of reading them from the request URL again. The Fetch and Node catch-all handlers pass the params they matched to the route, so they are not parsed from the request URL again either.
