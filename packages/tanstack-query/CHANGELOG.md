# @rest-rpc/tanstack-query

## 0.8.0

No changes in this release.

## 0.7.0

### Minor Changes

- c04340d: Add a `prefix` option to `createTanstackQueryUtils()` and a `key()` util on every node of the util tree.

- `prefix` starts every query and mutation key of the utils. Query keys hold the route and its request, so a value the client sends with every request that changes the response, such as a locale in `globalHeaders`, can be added to the keys with `createTanstackQueryUtils(client, { prefix: ["locale", locale] })`.
- `key()` returns the key that matches every query of the utils, of a group or of a route, prefix included, such as `queryClient.invalidateQueries({ queryKey: queryUtils.posts.key() })`. `key` is reserved, so a client tree with a route or group named `key` is a type error.

### Patch Changes

- c04340d: Add a `default` condition next to `import` in each package's `exports`, so resolvers that don't use the `import` condition, such as some bundler plugins, find the entry points.
- c04340d: `queryOptions()` and `infiniteQueryOptions()` with a request are accepted by `useSuspenseQuery()` and `useSuspenseInfiniteQuery()`. Their `queryFn` was typed as possibly `skipToken`, which the suspense hooks reject. Options with a `skipToken` request keep that type, so the suspense hooks still reject them.

## 0.6.0

### Minor Changes

- aae3fd4: Add a `fetch` function to each route's TanStack Query utils that calls the underlying client route directly

## 0.5.0

No changes in this release.

## 0.4.0

No changes in this release.

## 0.3.0

No changes in this release.

## 0.2.0

### Patch Changes

- 0948a36: Client calls may omit a `query` or `headers` object without required fields, a `body` whose schema accepts `undefined` on routes with one body media type, and a request without required fields. Before, only headers could be omitted, and only inside a passed request. TanStack Query `request` options and the local client follow the same rules, and local calls receive an omitted `query` or `headers` as `{}`, as over HTTP.
