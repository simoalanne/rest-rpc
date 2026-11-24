---
"@rest-rpc/server": minor
---

Add `createToolsFromRoutes()`, which turns a route tree into tools shaped like MCP tools: a definition and a `call` function, to register with an MCP server or an agent framework. Tool calls run through the routes' validation and middleware without HTTP. `mergeTools()` merges tools into two, one that finds tools and one that calls a tool by name, so a model can use every route of a large API.
