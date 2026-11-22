---
"@rest-rpc/tanstack-query": minor
---

Add a `prefix` option to `createTanstackQueryUtils()` and a `key()` util on every node of the util tree.

- `prefix` starts every query and mutation key of the utils. Query keys hold the route and its request, so a value the client sends with every request that changes the response, such as a locale in `globalHeaders`, can be added to the keys with `createTanstackQueryUtils(client, { prefix: ["locale", locale] })`.
- `key()` returns the key that matches every query of the utils, of a group or of a route, prefix included, such as `queryClient.invalidateQueries({ queryKey: queryUtils.posts.key() })`. `key` is reserved, so a client tree with a route or group named `key` is a type error.
