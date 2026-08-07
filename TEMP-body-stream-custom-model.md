# Temporary Note: Body, Stream, and Custom Schema Model

## Decision Direction

Standardize body modeling around two independent concepts:

- content/encoding: default JSON vs custom content type
- framing: single body vs stream

The common JSON case should remain the shortest syntax.

## Proposed Vocabulary

```ts
responses: {
	200: UserSchema;
	204: noBody(); // server sends only status/headers, no body
	200: custom({ contentType: "text/csv", schema: CsvSchema }); // arbitrary single body from server to client
	200: stream(EventSchema); // NDJSON/message stream from server to client. server yields each message and validates against EventSchema
	200: stream(custom({ contentType: "application/octet-stream" })); // arbitrary stream from server to client.
}

request: {
  body: UserSchema;
  body: noBody();
  body: custom({ contentType: "text/csv", schema: CsvSchema }); // arbitrary single body from client to server
}
```

Meanings:

- plain Standard Schema means a single JSON body
- `noBody()` means no body
- `custom(...)` means a single custom body with a required content type and
  optional schema
- `stream(schema)` means an NDJSON/message stream where each item is validated
  by the schema
- `stream(custom(...))` means a custom/raw stream; schema, if present, validates
  each yielded item/chunk rather than the completed stream

An optional `json(schema)` helper can exist as identity/readability sugar, but
it should not introduce a real `kind: "json"` descriptor if plain Standard
Schema already means JSON.

## Validation Semantics

- JSON bodies: strong whole-value validation.
- NDJSON/message streams: strong per-message validation because the library owns
  framing.
- Custom single bodies: optional whole-value validation can be useful, depending
  on the media type.
- Custom streams: whole-stream validation is usually not meaningful without
  buffering, which defeats streaming. Optional chunk/item validation is shallow or a type guard.

## Request Streaming

The same model can support request streaming later, but it can be deferred.
Response streaming is easier because the server controls production. Request
streaming has more runtime/client/body-parser differences and may be harder to abstract in a way that is not too opinionated.

Initial request support can stay:

- JSON
- no body
- custom body
