---
"@rest-rpc/core": minor
---

`InferClientRequest`, `InferClientResponse`, `InferClientError`, and `InferClientStreamData` accept the type of a client route function or client tree, such as `typeof client.todos.get`, in addition to routes. Request types inferred from a client already make headers that its `globalHeaders` provides optional.
