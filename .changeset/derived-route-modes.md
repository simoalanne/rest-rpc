---
"@rest-rpc/core": minor
"@rest-rpc/nest": patch
---

Route declarations no longer store `kind` and `input`. A route uses flat input when it declares `request.input`, and plain output when `output` is `"output"`. Generated contracts mark flat input with an empty `request.input`. In Nest, `@Implement()` now accepts method routes without a path, such as `route.get()`, inside a route tree, and rejects any route without a path at the tree root.
