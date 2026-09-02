import {
	type Contract,
	type HttpRouteDeclaration,
	type OpenApiRouteOptions,
	type RouteMetadata,
	type SseRouteDeclaration,
	type WebSocketRouteDeclaration,
} from "@rest-rpc/core/contract";
import { route, type as schemaType } from "@rest-rpc/core";
import {
	expectAssignable,
	expectError,
	expectNotAssignable,
	expectType,
} from "tsd";

const todo = schemaType<{ id: string; title: string }>();
const input = schemaType<{ title: string }>();
const unauthorized = schemaType<{ message: string }>();
const event = schemaType<{ id: string }>();
const clientMessage = schemaType<{ command: string }>();
const clientClose = schemaType<{ code: number }>();
const serverMessage = schemaType<{ event: string }>();
const serverReady = schemaType<{ connected: boolean }>();
const typedResponseHeaders = schemaType<{ "x-total": number }>();
const factoryHeaders = schemaType<{ authorization: string }>();
const localRequestHeader = schemaType<{ trace: number }>();
const scalarQuery = schemaType<{
	search?: string;
	page: number;
	enabled: boolean;
}>();
const scalarParams = schemaType<{ accountId: string; version: number }>();

const apiRoute = route.with({
	pathPrefix: "/api",
	headers: factoryHeaders,
	responses: { 401: unauthorized },
	metadata: { auth: true as const },
	openApi: { tags: ["API"] },
	flattenRequestKeys: true,
});

// HTTP route builders

// Builds an ordinary request/response route declaration.
const create = apiRoute
	.post("/todos")
	.body(input)
	.headers(schemaType<{ trace: string }>())
	.params(schemaType<{ accountId: string }>())
	.requestKeys({ title: "body", accountId: "params" })
	.withMetadata({ permission: "todos:create" as const })
	.withOpenApi({ summary: "Create todo" })
	.response(201, todo);

expectType<"POST">(create.method);
expectType<string>(create.path);
expectType<RouteMetadata>(create.metadata);
expectType<OpenApiRouteOptions>(create.openApi);
expectType<typeof input>(create.request.body);
expectType<typeof todo>(create.responses[201]);
expectType<typeof unauthorized>(create.responses[401]);
expectAssignable<HttpRouteDeclaration>(create);
expectAssignable<Contract>(create);

// Requires a local or factory-provided response before completion.
const incompleteHttp = route.get("/incomplete");
expectNotAssignable<HttpRouteDeclaration>(incompleteHttp);
expectNotAssignable<Contract>(incompleteHttp);

// Accepts a response supplied by the route factory.
const factoryResponse = apiRoute.get("/factory-response");
expectAssignable<HttpRouteDeclaration>(factoryResponse);
expectAssignable<Contract>(factoryResponse);
expectType<typeof factoryHeaders>(factoryResponse.request.headers.inherited);
expectType<true>(factoryResponse.request.flattenKeys);

// Preserves factory boolean options as literal route properties.
const strictRoute = route.with({ strictStatusCodes: true }).get("/strict");
expectType<true>(strictRoute.strictStatusCodes);
const nonStrictRoute = route
	.with({ strictStatusCodes: false })
	.get("/non-strict");
expectType<false>(nonStrictRoute.strictStatusCodes);

// Preserves schema and array-key inference for form and multipart bodies.
const importRoute = route
	.post("/imports")
	.formBody({ schema: input, arrayKeys: ["title"] })
	.customResponse(201, { contentType: "text/csv", schema: todo });

expectType<"formBody">(importRoute.request.body.kind);
expectType<typeof input>(importRoute.request.body.schema);
expectType<readonly ["title"]>(importRoute.request.body.arrayKeys);
expectType<"customBody">(importRoute.responses[201].kind);

// Supports the schema overload for form bodies.
const formSchema = route.post("/form-schema").formBody(input).response(201);
expectType<typeof input>(formSchema.request.body.schema);
// Supports both multipart body overloads.
const multipartSchema = route
	.post("/multipart-schema")
	.multipartBody(input)
	.response(201);
expectType<typeof input>(multipartSchema.request.body.schema);
const multipartObject = route
	.post("/multipart-object")
	.multipartBody({ schema: input, arrayKeys: ["title"] })
	.response(201);
expectType<typeof input>(multipartObject.request.body.schema);
expectType<readonly ["title"]>(multipartObject.request.body.arrayKeys);

// Preserves schema and content-type inference for custom request bodies.
const customRequestBody = route
	.post("/custom-body")
	.customBody({ schema: input, contentType: "application/xml" })
	.response(201);
expectType<typeof input>(customRequestBody.request.body.schema);
expectType<"application/xml">(customRequestBody.request.body.contentType);

const customRequestBodySchema = route
	.post("/custom-body-schema")
	.customBody(input)
	.response(201);
expectType<typeof input>(customRequestBodySchema.request.body.schema);

// Preserves query and streaming response inference.
const search = route.get("/search").jsonQuery(input).streamResponse(200, todo);
expectType<"jsonQuery">(search.request.query.kind);
expectType<"stream">(search.responses[200].kind);

// Ordinary params and query schemas accept scalar wire inputs.
const scalarRequest = route
	.get("/scalar/:accountId")
	.query(scalarQuery)
	.params(scalarParams)
	.response(200, todo);
expectType<typeof scalarQuery>(scalarRequest.request.query);
expectType<typeof scalarParams>(scalarRequest.request.params);

// Structured ordinary wire inputs must use jsonQuery instead.
expectError(
	route
		.get("/nested-query")
		.query(schemaType<{ filters: { tags: string[] } }>()),
);
expectError(
	route.get("/array-param/:ids").params(schemaType<{ ids: string[] }>()),
);

// Preserves response body, custom stream, and typed response-header inference.
const typedResponses = route
	.get("/typed-responses")
	.response(200, { body: todo, headers: typedResponseHeaders })
	.customStreamResponse(201, {
		contentType: "application/octet-stream",
		schema: input,
	});
expectType<typeof todo>(typedResponses.responses[200].body);
expectType<typeof typedResponseHeaders>(typedResponses.responses[200].headers);
expectType<typeof input>(typedResponses.responses[201].schema.schema);
expectError(
	route.get("/invalid-response-headers").response(200, {
		body: todo,
		headers: schemaType<{ invalid: { nested: string } }>(),
	}),
);

// Merges factory request headers with route-local request headers.
const factoryAndLocalHeaders = apiRoute
	.get("/merged-headers")
	.headers(localRequestHeader)
	.response(200);
expectType<typeof factoryHeaders>(
	factoryAndLocalHeaders.request.headers.inherited,
);
expectType<typeof localRequestHeader>(
	factoryAndLocalHeaders.request.headers.local,
);

expectAssignable<HttpRouteDeclaration>(route.get("/health").response(204));
expectAssignable<HttpRouteDeclaration>(
	route.get("/health").response(204, undefined),
);

// Duplicate response status codes are allowed, but will throw at runtime.
// this is a tradeoff where guarding this at type level is significantly more
// expensive for tsc, and the rare case where someone accidentally creates a
// duplicate response status code does not justify increased compile time for all other cases.
const duplicateResponseStatus = route
	.get("/health")
	.response(200, todo)
	.response(200, event);

expectAssignable<HttpRouteDeclaration>(duplicateResponseStatus);

// Supports mixed ordinary, custom, streaming, and custom-stream responses.
const mixedResponses = route
	.get("/responses")
	.response(200, todo)
	.customResponse(201, { contentType: "text/csv", schema: input })
	.streamResponse(202, event)
	.customStreamResponse(203, {
		contentType: "application/octet-stream",
		schema: unauthorized,
	});

expectType<typeof todo>(mixedResponses.responses[200]);
expectType<"customBody">(mixedResponses.responses[201].kind);
expectType<typeof input>(mixedResponses.responses[201].schema);
expectType<"stream">(mixedResponses.responses[202].kind);
expectType<typeof event>(mixedResponses.responses[202].schema);
expectType<"stream">(mixedResponses.responses[203].kind);
expectType<"customBody">(mixedResponses.responses[203].schema.kind);
expectType<typeof unauthorized>(mixedResponses.responses[203].schema.schema);
expectAssignable<HttpRouteDeclaration>(mixedResponses);

// Keeps unused request and route configuration available after a response.
const configuredAfterResponse = route
	.post("/configured-after-response")
	.customResponse(200, { contentType: "text/plain", schema: todo })
	.body(input)
	.jsonQuery(schemaType<{ search: string }>())
	.params(schemaType<{ id: string }>())
	.headers(input)
	.requestKeys({ title: "body", id: "params" })
	.withMetadata({ auth: true })
	.withOpenApi({ summary: "Configured after response" })
	.streamResponse(201, event);
expectType<typeof input>(configuredAfterResponse.request.body);
expectType<"jsonQuery">(configuredAfterResponse.request.query.kind);
expectType<typeof todo>(configuredAfterResponse.responses[200].schema);
expectType<typeof event>(configuredAfterResponse.responses[201].schema);
expectType<RouteMetadata>(configuredAfterResponse.metadata);
expectType<OpenApiRouteOptions>(configuredAfterResponse.openApi);
expectAssignable<HttpRouteDeclaration>(configuredAfterResponse);

// Keeps HTTP body variants and query variants mutually exclusive.
const bodyUsed = route.post("/body-used").body(input);
expectError(bodyUsed.formBody(input));
expectError(bodyUsed.multipartBody(input));
expectError(bodyUsed.customBody(input));
expectError(route.post("/body-variants").formBody(input).body(input));
expectError(
	route.post("/body-variants-2").multipartBody(input).customBody(input),
);
expectError(route.get("/query-used").query(input).jsonQuery(input));
expectError(route.get("/json-query-used").jsonQuery(input).query(input));

// Allows each HTTP request setter only once regardless of response order.
const singleUseHttpConfigured = route
	.get("/single-use-http")
	.query(input)
	.params(input)
	.headers(input)
	.requestKeys({ title: "query" })
	.withMetadata({ auth: true })
	.withOpenApi({ summary: "single use" });
expectError(singleUseHttpConfigured.params(input));
expectError(singleUseHttpConfigured.headers(input));
expectError(singleUseHttpConfigured.requestKeys({ title: "query" }));
expectError(singleUseHttpConfigured.withMetadata({ auth: true }));
expectError(singleUseHttpConfigured.withOpenApi({ summary: "again" }));
expectAssignable<HttpRouteDeclaration>(singleUseHttpConfigured.response(200));

expectError(route.get("/health").response(todo));
expectError(apiRoute.post("/todos").responses({ 201: todo }));

// SSE route builders

// Requires one event response before SSE completion and excludes HTTP APIs.
const incompleteSse = route.sse("/events");
expectNotAssignable<SseRouteDeclaration>(incompleteSse);
expectNotAssignable<Contract>(incompleteSse);
expectError(incompleteSse.body(event));
expectError(incompleteSse.headers(schemaType<{ authorization: string }>()));
expectError(incompleteSse.response(event).response(event));

// Allows each SSE request setter once and remains configurable until response().
const sseConfiguredBeforeResponse = route
	.with({ flattenRequestKeys: false })
	.sse("/configured-events")
	.query(input)
	.params(schemaType<{ roomId: string }>())
	.requestKeys({ title: "query", roomId: "params" })
	.withMetadata({ public: true })
	.withOpenApi({ summary: "events" });
expectError(sseConfiguredBeforeResponse.query(input));
expectError(sseConfiguredBeforeResponse.jsonQuery(input));
expectError(sseConfiguredBeforeResponse.params(input));
expectError(sseConfiguredBeforeResponse.requestKeys({ title: "query" }));
expectError(sseConfiguredBeforeResponse.withMetadata({ public: false }));
expectError(sseConfiguredBeforeResponse.withOpenApi({ summary: "again" }));
// Preserves protocol request configuration after response().
const sseConfigured = sseConfiguredBeforeResponse.response(event);
expectType<false>(sseConfigured.request.flattenKeys);
expectType<typeof input>(sseConfigured.request.query);
expectType<typeof event>(sseConfigured.responses[200]);
expectError(sseConfigured.body(event));
expectError(sseConfigured.headers(input));
expectError(sseConfigured.response(event));
expectError(sseConfigured.streamResponse(200, event));
expectError(sseConfigured.clientMessage(clientMessage));

// Supports JSON query and unused route configuration after response().
const sseConfiguredAfterResponse = route
	.sse("/configured-after-response")
	.response(event)
	.jsonQuery(input)
	.params(schemaType<{ roomId: string }>())
	.requestKeys({ query: "query", roomId: "params" })
	.withMetadata({ public: true })
	.withOpenApi({ summary: "events" });
expectType<"jsonQuery">(sseConfiguredAfterResponse.request.query.kind);
expectType<typeof input>(sseConfiguredAfterResponse.request.query.schema);
expectType<RouteMetadata>(sseConfiguredAfterResponse.metadata);
expectType<OpenApiRouteOptions>(sseConfiguredAfterResponse.openApi);
expectAssignable<SseRouteDeclaration>(sseConfiguredAfterResponse);
expectAssignable<Contract>(sseConfiguredAfterResponse);

// Builds a complete SSE declaration with query and route metadata.
const sse = incompleteSse
	.query(schemaType<{ cursor: string }>())
	.response(event)
	.withMetadata({ public: true as const });

expectType<"GET">(sse.method);
expectType<"sse">(sse.mode);
expectType<typeof event>(sse.responses[200]);
expectType<RouteMetadata>(sse.metadata);
expectAssignable<SseRouteDeclaration>(sse);
expectAssignable<Contract>(sse);

// WebSocket route builders

// Accumulates named client and server messages into the declaration.
const socket = route
	.ws("/socket")
	.clientMessage("command", clientMessage)
	.clientMessage("close", clientClose)
	.serverMessage("event", serverMessage)
	.serverMessage("ready", serverReady)
	.params(schemaType<{ roomId: string }>())
	.withMetadata({ public: true });

expectType<"GET">(socket.method);
expectType<"webSocket">(socket.mode);
expectType<typeof clientMessage>(socket.messages.client.command);
expectType<typeof clientClose>(socket.messages.client.close);
expectType<typeof serverMessage>(socket.messages.server.event);
expectType<typeof serverReady>(socket.messages.server.ready);
expectError(socket.messages.client.missing);
expectError(socket.messages.server.missing);
expectType<RouteMetadata>(socket.metadata);
expectAssignable<WebSocketRouteDeclaration>(socket);
expectAssignable<Contract>(socket);
expectError(socket.withOpenApi({ summary: "Join socket" }));

// Allows each WebSocket request setter once and excludes HTTP/SSE APIs.
const completeSocket = route
	.ws("/complete-socket")
	.query(input)
	.params(schemaType<{ roomId: string }>())
	.requestKeys({ title: "query", roomId: "params" })
	.withMetadata({ public: true })
	.clientMessage("command", clientMessage)
	.serverMessage("event", serverMessage);
expectAssignable<WebSocketRouteDeclaration>(completeSocket);
expectAssignable<Contract>(completeSocket);
expectError(completeSocket.query(input));
expectError(completeSocket.jsonQuery(input));
expectError(completeSocket.params(input));
expectError(completeSocket.requestKeys({ title: "query" }));
expectError(completeSocket.withMetadata({ public: false }));
expectError(completeSocket.withOpenApi({ summary: "socket" }));
expectError(completeSocket.response(event));
expectError(completeSocket.streamResponse(200, event));
expectError(completeSocket.body(event));
expectError(completeSocket.headers(input));

// A single message direction is enough to complete a WebSocket route.
const clientOnlySocket = route
	.ws("/client-only")
	.clientMessage("command", clientMessage);
expectAssignable<WebSocketRouteDeclaration>(clientOnlySocket);
expectAssignable<Contract>(clientOnlySocket);
const serverOnlySocket = route
	.ws("/server-only")
	.serverMessage("event", serverMessage);
expectAssignable<WebSocketRouteDeclaration>(serverOnlySocket);
expectAssignable<Contract>(serverOnlySocket);
const messageLessSocket = route.ws("/message-less");
expectNotAssignable<WebSocketRouteDeclaration>(messageLessSocket);
expectNotAssignable<Contract>(messageLessSocket);
