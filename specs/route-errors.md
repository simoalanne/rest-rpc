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

A status outside 400–599 throws.

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
- `new RouteError(code, ...)`: loose. Sent as thrown when the route does not
  declare the code, for errors that apply across routes, such as
  `UNAUTHORIZED` from middleware.

TypeScript cannot check that a thrown error is declared on the executing route.
The pipeline does:

| Thrown                               | Result                                                                              |
| ------------------------------------ | ----------------------------------------------------------------------------------- |
| `RouteError` with a declared code    | Resolved: declared status, validated `data` and headers, original error as `cause`. |
| `RouteError` with an undeclared code | Sent as thrown, including built-ins. Not validated, and not part of route types.    |
| Anything else                        | Rejects unchanged.                                                                  |

Matching is by code, not class. The route's declaration is the source of truth.
Validation of `data` and headers follows `disableResponseValidation`; a failure
becomes `INTERNAL_SERVER_ERROR`.

### Built-in errors

| Code                        | Definition                | Status | `data`                                      | Produced by                           |
| --------------------------- | ------------------------- | ------ | ------------------------------------------- | ------------------------------------- |
| `REQUEST_VALIDATION_FAILED` | `RequestValidationFailed` | 400    | issues grouped by body/query/params/headers | request validation                    |
| `MALFORMED_REQUEST_BODY`    | `MalformedRequestBody`    | 400    | none                                        | body decoding                         |
| `UNSUPPORTED_MEDIA_TYPE`    | `UnsupportedMediaType`    | 415    | none                                        | request content type selection        |
| `INTERNAL_SERVER_ERROR`     | `InternalServerError`     | 500    | none (`cause` holds `{ location, issues }`) | response, error and stream checks     |
| `INTERNAL_SERVER_ERROR`     | `InternalServerError`     | 500    | none (`cause` holds the thrown error)       | other thrown errors, `createApp` only |
| `NOT_FOUND`                 | `NotFound`                | 404    | none                                        | `createApp` default `notFound`        |

An invalid response is a server bug, so response validation failures share
`INTERNAL_SERVER_ERROR` and do not reveal that validation failed. `onError`
tells them apart by `cause`.

The definitions are `routeError` classes exported from `@rest-rpc/server`, and
the server creates built-in errors from them.

Built-ins are sent whether or not the route declares them, because the server
produces them. Like other undeclared codes, they are not part of route types,
so clients receive an undeclared built-in as a `RouteError` that is not
declared. Declaring the definition with `.error()` makes clients recognize it
as declared and types its `data`.

### Layers

| API                                      | `RouteError`                      | Other error                           |
| ---------------------------------------- | --------------------------------- | ------------------------------------- |
| `compileRoutes`, `createCatchAllHandler` | serialized                        | rejects into the framework            |
| `createApp` (and Node `serve`)           | serialized                        | serialized as `INTERNAL_SERVER_ERROR` |
| `call`, local client                     | see [Local client](#local-client) | see [Local client](#local-client)     |

### Hooks

- `requestValidationErrorHandler` and `responseValidationErrorHandler` are removed.
- `onError?: (error: RouteError, request: Request) => void` is a
  `compileRoutes` option, inherited by `createApp`. It observes every
  `RouteError` the pipeline serializes, including stream item validation
  failures after a stream started. It is not awaited, and errors it throws or
  rejects with are ignored, so it cannot change the response.
- `createApp`'s `onError` no longer returns a response. `notFound` stays and
  its default body is the `NOT_FOUND` error.

## Contract extraction

Extracted routes keep `errors` as `{ CODE: { status } }`, enough for the client
to recognize declared codes. They also keep each declared response's status and
media types as `responses: { STATUS: { content?: { MEDIA_TYPE: null } } }`, so
the client checks 2xx statuses and content types without schemas.

## Fetch client

A call resolves with the success envelope or rejects with:

- `RouteError` for every error response whose body has a `code`. `isDeclared`
  is `true` when the route declares it.
- A plain `Error` otherwise: a response outside the contract, or no response
  (network failure, abort, timeout, failure reading the body). Errors of
  reading the body are the original error.

Undeclared `RouteError`s keep their values for general error handling, such as
a project-wide `UNAUTHORIZED`, but they are not part of route types. Calls
reject with `InferClientError<T> | Error`, and an undeclared `RouteError` is an
`Error`.

`HttpError` is removed.

### Classification

A non-2xx response whose decoded body is an object with a string `code` is a
`RouteError` with the response status and headers, the body's `message` (or the
code), and the body's `data`. It is declared when the route declares the code;
the declared status must equal the response status, and with
`validateResponses` its `data` and headers are validated. The client decides
`isDeclared` from its own contract; it is not sent. A server matches thrown
errors by code, so it never sends a declared code as undeclared, and a client
`RouteError` with a declared code is always the declared error.

Everything else that has a response rejects with an `Error`:

| Situation                                             | `message`                                    | `cause`        |
| ----------------------------------------------------- | -------------------------------------------- | -------------- |
| Non-2xx without a `code`, such as a proxy page        | `Request failed with status N.`              | none           |
| Declared code with a different status                 | `Response did not match the route contract.` | none           |
| Declared code whose `data` or headers fail validation | `Response did not match the route contract.` | issues         |
| 2xx with an undeclared status or content type         | `Response did not match the route contract.` | none           |
| 2xx whose body or headers fail validation             | `Response did not match the route contract.` | issues         |
| Body decoding fails                                   | `Response body could not be decoded.`        | decoding error |
| Stream item fails validation                          | `Response did not match the route contract.` | issues         |
| Stream item cannot be decoded                         | `Event stream could not be decoded.`         | decoding error |

Status and content type checks need declared responses, so routes with
inferred responses accept every 2xx response. A `text/event-stream` response
that breaks the contract is cancelled without being read. Validation needs
schemas, so extracted contracts skip it.

### Types

- `InferClientResponse<T>`: the success envelope. `InferClientSuccess` is
  removed because responses are success-only.
- `InferClientError<T>`: the declared variants, `never` for a route without
  declared errors. Calls reject with `InferClientError<T> | Error`.
- `ClientPromise<TData, TError>`: `Promise<TData>` with a type-only `~error`
  property. Client calls return it.
- `safe(promise)`: resolves to `SafeResult<TData, TError>`,
  `{ error } | { data }` with the absent field typed `?: undefined`, as in
  Standard Schema results. `data` is typed only after checking `error`, and
  `result.error` is available without destructuring. The error type is read
  from `ClientPromise`.
- `isDeclaredError(error)`: `error instanceof RouteError && error.isDeclared`,
  typed as `error is Extract<T, RouteError>`, so a typed error from `safe()` or
  TanStack narrows to the route's declared errors without naming the route. An
  `unknown` value narrows to `RouteError`.
- `instanceof RouteError` matches undeclared errors too, for general error
  handling. On a typed error it adds `RouteError<any, …>` to the declared
  variants, so property access is `any`: it does not type specific codes.

No safe client helper or extra `safe()` field is provided: `isDeclaredError()`
is the one way to narrow typed errors, and a `catch` block that needs the
route's codes uses `safe()` instead.

## Local client

`call` and the local client return `ClientPromise` with the same types as the
fetch client:

| Thrown inside `call`          | Rejection                                                    |
| ----------------------------- | ------------------------------------------------------------ |
| Declared code, valid `data`   | the resolved `RouteError`, declared                          |
| Declared code, invalid `data` | the `INTERNAL_SERVER_ERROR` that would be sent, not declared |
| Undeclared code               | the thrown `RouteError`, not declared                        |
| Other error                   | the `Error`, unchanged                                       |

## TanStack Query

The fetch client throws, so generated options no longer throw envelopes. The
error type is `InferClientError<E> | Error`, narrowed with `isDeclaredError()`.
The package's own `InferClientError` is removed.

## OpenAPI

Declared errors become responses keyed by status. Codes sharing a status merge
into a `oneOf` of their bodies. Each body schema is
`{ code: const, message: string, data? }`. Built-in errors are documented only
when the route declares them.

## Non-goals

- A safe client wrapper, `unwrap()`, or a custom error wire format.
- SSE error events. A started stream that fails ends.
