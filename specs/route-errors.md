# Route errors

Status: accepted. Pre-1.0, so breaking changes are intended and no compatibility
layer is kept.

## Problem

- Non-2xx responses are declared with `.response()` and travel through the same
  channel as successes: handler return types, inferred responses, client
  envelopes and TanStack's thrown envelope.
- An extracted contract drops `responses`, so the client cannot tell a declared
  404 from a proxy's 502.
- A shared base that declares a 401 response leaves inferred mode, so every
  route built on it can only return 401.
- Built-in failures use ad hoc shapes: `RequestValidationError`,
  `ResponseValidationError`, and `{ message }` bodies for 415 and decode errors.

## Declaring errors

### `routeError(code, options?)` (core, re-exported from server)

Returns a subclass of `RouteError` that also carries its declaration as static
fields (`code`, `status`, `message`, `data`, `headers`, `description`).

```ts
const UserNotFound = routeError("USER_NOT_FOUND", {
	status: 404,
	data: z.object({ id: z.string() }),
});

throw new UserNotFound({ id });
```

Options:

| Option        | Default | Meaning                                                     |
| ------------- | ------- | ----------------------------------------------------------- |
| `status`      | `400`   | HTTP status, 400–599.                                       |
| `data`        | none    | Standard Schema for the `data` field.                       |
| `headers`     | none    | Response headers schema, as for `.response()`.              |
| `message`     | `code`  | Default message, overridable when constructing an instance. |
| `description` | none    | OpenAPI response description.                               |

Constructor: `new Definition(data, options?)` when `data` is declared, otherwise
`new Definition(options?)`. `options` is `{ message?, headers?, cause? }`, and
`headers` is required when a headers schema is declared.

`UNKNOWN_ERROR` is reserved; `routeError("UNKNOWN_ERROR")` throws. A status
outside 400–599 throws.

### `.error(definition)` / `.error(code, options?)` (route builder)

- `.error(code, options)` is sugar for `.error(routeError(code, options))`.
- Errors are stored in `RouteDeclaration.errors`, keyed by code. They are not
  part of `responses`, so declaring an error never leaves inferred mode.
- Errors accumulate along the chain. Re-declaring the same definition object is
  a no-op; a different declaration for an existing code throws.
- `.error()` on the root moves off the root the way `.prefix()` does, so
  `$context()` and `.middleware()` must come first.

### Success-only responses

- `.response()` accepts 2xx statuses only.
- Inferred handler statuses are 2xx only, enforced by the handler types and at
  runtime.
- 1xx and 3xx are not declarable.

## Wire format

Every error response rest-rpc sends is JSON:

```http
HTTP/1.1 404 Not Found
Content-Type: application/json

{ "code": "USER_NOT_FOUND", "message": "User not found", "data": { "id": "42" } }
```

- `code` and `message` are always present; `data` only when the error has data.
- The status is the HTTP status. Declared headers are response headers.
- No `defined` flag and no envelope: the client decides whether a code is known
  from its contract.

## `RouteError`

```ts
class RouteError<TCode, TData, TStatus, THeaders> extends Error {
	code;
	status;
	message;
	data;
	headers;
	cause?;
}
```

One class is used by the server, the local client, the fetch client and
TanStack. On the server, `cause` is never serialized.

## Server

### Throwing

Errors are thrown; success is returned. Handlers and middleware throw:

- `new errors.CODE(...)`: `errors` on the handler and `.use()` request holds the
  definitions declared earlier in the chain.
- `new Definition(...)` from an imported `routeError` definition, for domain code.
- `new RouteError(code, ...)`: loose, not recommended.

TypeScript cannot check that a thrown error is declared on the executing route.
The pipeline does:

| Thrown                            | Result                                                                              |
| --------------------------------- | ----------------------------------------------------------------------------------- |
| `RouteError` with a declared code | Resolved: declared status, validated `data` and headers, original error as `cause`. |
| `RouteError` with a built-in code | Sent as thrown.                                                                     |
| `RouteError` with any other code  | Rejects with an `Error` naming the route and code (programmer error).               |
| Anything else                     | Rejects unchanged.                                                                  |

Matching is by code, not class. The route's declaration is the source of truth.
Validation of `data` and headers follows `disableResponseValidation`; a failure
becomes `RESPONSE_VALIDATION_FAILED`.

### Built-in errors

| Code                         | Status | `data`                                      | Produced by                       |
| ---------------------------- | ------ | ------------------------------------------- | --------------------------------- |
| `REQUEST_VALIDATION_FAILED`  | 400    | issues grouped by body/query/params/headers | request validation                |
| `MALFORMED_REQUEST_BODY`     | 400    | none                                        | body decoding                     |
| `UNSUPPORTED_MEDIA_TYPE`     | 415    | none                                        | request content type selection    |
| `RESPONSE_VALIDATION_FAILED` | 500    | none (`cause` holds `{ location, issues }`) | response, error and stream checks |
| `INTERNAL_SERVER_ERROR`      | 500    | none (`cause` holds the thrown error)       | `createApp` only                  |
| `NOT_FOUND`                  | 404    | none                                        | `createApp` default `notFound`    |

Built-ins are not reserved and not part of route types. A route may declare one
to make it known to clients; it must use the built-in status to be recognized.

### Layers

| API                                      | Declared or built-in `RouteError` | Undeclared code / other error         |
| ---------------------------------------- | --------------------------------- | ------------------------------------- |
| `compileRoutes`, `createCatchAllHandler` | serialized                        | rejects into the framework            |
| `createApp` (and Node `serve`)           | serialized                        | serialized as `INTERNAL_SERVER_ERROR` |
| `call`, local client                     | see [Local client](#local-client) | propagates unchanged                  |

### Hooks

- `requestValidationErrorHandler` and `responseValidationErrorHandler` are removed.
- `onError?: (error: RouteError, request: Request) => void` is a
  `compileRoutes` option, inherited by `createApp`. It observes every
  `RouteError` the pipeline serializes, including stream item validation
  failures after a stream started. It is not awaited and cannot change the
  response.
- `createApp`'s `onError` no longer returns a response. `notFound` stays and
  its default body is the `NOT_FOUND` error.

## Contract extraction

Extracted routes keep `errors` as `{ CODE: { status } }`, enough for the client
to recognize declared codes.

## Fetch client

A call resolves with the success envelope or rejects with:

- `RouteError` when a response arrived.
- The original `Error` when no response arrived, or reading the body failed
  (network failure, abort, timeout).

`HttpError` is removed.

### Classification

A non-2xx response is a declared error when its decoded body is an object with
a string `code`, the route declares that code, and the declared status equals
the response status. With `validateResponses`, `data` and headers are validated.

Everything else that has a response becomes `UNKNOWN_ERROR`:

| Situation                                                   | `data`       | `cause`        |
| ----------------------------------------------------------- | ------------ | -------------- |
| Non-2xx, undeclared code (incl. built-ins), or foreign body | decoded body | none           |
| Declared code with a different status                       | decoded body | none           |
| Declared code whose `data` or headers fail validation       | decoded body | issues         |
| 2xx with an undeclared status or content type               | decoded body | none           |
| 2xx whose body or headers fail validation                   | decoded body | issues         |
| Body decoding fails                                         | `undefined`  | decoding error |
| Stream item fails validation or cannot be decoded           | decoded item | issues / error |

`message` is the body's `message` when it is a string, otherwise a generic one.
`status` is always the response status.

### Types

- `InferClientResponse<T>`: the success envelope. `InferClientSuccess` is
  removed because responses are success-only.
- `InferClientError<T>`: declared variants plus `RouteError<"UNKNOWN_ERROR">`.
  Calls reject with `InferClientError<T> | Error`.
- `ClientPromise<TData, TError>`: `Promise<TData>` with a type-only `~error`
  property. Client calls return it.
- `safe(promise)`: resolves to `[null, data] | [error, undefined]`. The error
  type is read from `ClientPromise`, or `unknown` for other promises.

No safe client helper is provided.

## Local client

`call` and the local client return `ClientPromise` with the same types as the
fetch client:

| Thrown inside `call`                      | Rejection                                                                                  |
| ----------------------------------------- | ------------------------------------------------------------------------------------------ |
| Declared code, valid `data`               | the resolved `RouteError`                                                                  |
| Built-in, or declared with invalid `data` | `UNKNOWN_ERROR` with the built-in status, the wire body as `data`, the built-in as `cause` |
| Undeclared code or other error            | the `Error`, unchanged                                                                     |

## TanStack Query

The fetch client throws, so generated options no longer throw envelopes. The
error type is `InferClientError<E> | Error`. The package's own
`InferClientError` is removed.

## OpenAPI

Declared errors become responses keyed by status. Codes sharing a status merge
into a `oneOf` of their bodies. Each body schema is
`{ code: const, message: string, data? }`. Built-in errors are not documented.

## Non-goals

- A safe client wrapper, `unwrap()`, or a custom error wire format.
- SSE error events. A started stream that fails ends.
- Exporting built-in error definitions.
