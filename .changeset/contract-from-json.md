---
"@rest-rpc/core": minor
---

Add `contractFromJson<typeof router>(json)`, which types a contract that `extractContract()` wrote to JSON as the route tree it was extracted from, so it no longer needs an `as unknown as` cast. It throws a `TypeError` when the value doesn't have the shape of an extracted contract.
