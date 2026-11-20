---
"@rest-rpc/core": minor
"@rest-rpc/server": minor
---

Throw `BodySerializationError` from the built-in codecs' `serialize` for a value they don't encode. It extends `TypeError` and carries the `mediaType` the value was serialized for, the value kinds the codec `expected`, and the kind of value it `received`. The JSON codec still throws the errors of `JSON.stringify`.
