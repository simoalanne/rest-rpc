---
"@rest-rpc/core": minor
---

Remove the `timeoutMs` client option. A timeout is now an interceptor, which decides what the time covers, such as only the wait for the response or the body too:

```ts
const timeout = (ms: number) =>
	clientInterceptor(({ request, next }) =>
		next(
			new Request(request, {
				signal: AbortSignal.any([request.signal, AbortSignal.timeout(ms)]),
			}),
		),
	);

createClient(contract, { interceptors: [timeout(10_000)] });
```

The call's `signal` is now passed to the `Request` unchanged.
