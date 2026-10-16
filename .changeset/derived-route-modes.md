---
"@rest-rpc/core": minor
---

Route declarations no longer store `kind` and `input`. A route uses flat input when it declares `request.input`, and plain output when `output` is `"output"`. Generated contracts mark flat input with an empty `request.input`.
