---
"@rest-rpc/server": patch
---

Declaration emit no longer fails with `TS4023` for routes with defined responses whose handler calls `respond()` without options. The body and brand of a `ResponseEnvelope` are now the exported `ResponseEnvelopeBase` interface, which declarations can name.
