---
"@rest-rpc/core": patch
"@rest-rpc/server": patch
"@rest-rpc/tanstack-query": patch
---

Add a `default` condition next to `import` in each package's `exports`, so resolvers that don't use the `import` condition, such as some bundler plugins, find the entry points.
