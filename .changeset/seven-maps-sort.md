---
"@rest-rpc/server": patch
---

Allow RouteResponseError to be scoped to any part of the contract not just specific route so it's easier to use in shared code with common responses. Additionally fix an issue where RouteResponseError declared errors thrown by the route handler would not go through response validation correctly. Also fix an issue where shorthand response with status field was allowed and could lead to unpredictable behaviour
