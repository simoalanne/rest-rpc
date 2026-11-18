---
"@rest-rpc/core": minor
"@rest-rpc/server": minor
---

Params, query and headers schemas accept any object input, and header values passed to `respond()`, `globalHeaders` and `additionalHeaders` accept any value, all sent with `String()` as documented. Before, their inputs had to be strings, numbers or booleans, so `z.coerce.number()` needed `<number>` to compile. A promise in `globalHeaders` is awaited, like the result of a provider function. `ClientHeaderValue` and `RequestScalar` are removed, and `ClientHeaders` is `Record<string, unknown>`.
