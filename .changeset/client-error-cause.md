---
"@rest-rpc/core": minor
---

An error response without a string `code`, such as a proxy's error page, rejects with an `Error` whose `cause` holds the response as the client received it: its status, headers, cookies and decoded body. Before, only the status was kept, in the message.
