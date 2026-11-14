---
"@rest-rpc/server": patch
---

Serve `createApp` routes registered with Bun's native router through one promise per request instead of nested async wrappers, which lowers per-request overhead.
