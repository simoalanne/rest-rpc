import {
	type Contract,
	type OpenApiRouteOptions,
	type RouteDeclaration,
} from "@rest-rpc/core/contract";
import { route, type as schemaType } from "@rest-rpc/core";
import z from "zod";
import { expectAssignable, expectError, expectType } from "tsd";

const todo = schemaType<{ id: string; title: string }>();
const input = schemaType<{ title: string }>();
const unauthorized = schemaType<{ message: string }>();
const event = schemaType<{ id: string }>();
const typedResponseHeaders = schemaType<{ "x-total": number }>();
const scalarQuery = schemaType<{
	search?: string;
	page: number;
	enabled: boolean;
}>();
const scalarParams = schemaType<{ accountId: string; version: number }>();
const customText = schemaType<string>();
const customBytes = schemaType<Uint8Array>();

// Shorthand route builders

// A declared output completes a no-input shorthand contract route.
const shorthandNoInput = route.output(todo);
expectType<"procedure">(shorthandNoInput["~restrpc"].kind);
expectType<typeof todo>(shorthandNoInput["~restrpc"].responses[200].body);
expectAssignable<RouteDeclaration>(shorthandNoInput["~restrpc"]);
expectAssignable<Contract>(shorthandNoInput);

// Like an HTTP route with one response, it is complete but remains extendable.
const shorthandOutputFirst = shorthandNoInput.input(input);
expectAssignable<RouteDeclaration>(shorthandOutputFirst["~restrpc"]);
expectType<typeof input>(shorthandOutputFirst["~restrpc"].request.body);
expectType<typeof todo>(shorthandOutputFirst["~restrpc"].responses[200].body);
expectAssignable<Contract>(shorthandOutputFirst);

// Input starts with an empty response map until an output is declared.
const shorthandInput = route.input(input);
expectAssignable<Contract>(shorthandInput);
const shorthandWithInput = shorthandInput.output(todo);
expectType<typeof input>(shorthandWithInput["~restrpc"].request.body);
expectType<typeof todo>(shorthandWithInput["~restrpc"].responses[200].body);
expectAssignable<RouteDeclaration>(shorthandWithInput["~restrpc"]);
expectAssignable<Contract>(shorthandWithInput);

const customOutput = route.output(customText, { contentType: "text/plain" });
expectType<"text/plain">(customOutput["~restrpc"].responses[200].contentType);
const streamOutput = route.input(input).streamOutput(event);
expectType<"stream">(streamOutput["~restrpc"].responses[200].kind);
expectType<typeof event>(streamOutput["~restrpc"].responses[200].body);
const streamOutputFirst = route.streamOutput(event).input(input);
expectType<typeof input>(streamOutputFirst["~restrpc"].request.body);

const formInput = route
	.input(input, { contentType: "application/x-www-form-urlencoded" })
	.output(todo);
expectType<typeof input>(formInput["~restrpc"].request.body);
expectType<"application/x-www-form-urlencoded">(
	formInput["~restrpc"].request.contentType,
);

// Completed shorthand declarations do not expose explicit HTTP setters.
expectError(route.handler(() => ({ id: "todo-1", title: "Todo" })));
expectError(
	shorthandInput.handler((request: { title: string }) => ({
		id: "todo-1",
		title: request.title,
	})),
);
expectError(shorthandInput.input(input));
expectError(shorthandWithInput.output(todo));
expectError(shorthandWithInput.streamOutput(event));
expectError(shorthandOutputFirst.input(input));
expectError(shorthandOutputFirst.output(todo));
expectError(streamOutput.output(todo));
expectError(streamOutput.streamOutput(event));
expectError(shorthandWithInput.response(200, todo));
const explicitFlat = route.post("/todos").input(input).output(todo);
expectType<typeof input>(explicitFlat["~restrpc"].request.body);

// HTTP route builders

// Builds an ordinary request/response route declaration.
const create = route
	.post("/todos")
	.body(input)
	.headers(schemaType<{ trace: string }>())
	.metadata({ permission: "todos:create" as const })
	.openAPI({ summary: "Create todo" })
	.response(201, todo)
	.response(401, unauthorized);

expectType<"POST">(create["~restrpc"].method);
expectType<"/todos">(create["~restrpc"].path);
expectType<"segments">(create["~restrpc"].input);
expectType<"response">(create["~restrpc"].output);
expectType<{ readonly permission: "todos:create" }>(
	create["~restrpc"].metadata,
);
expectType<OpenApiRouteOptions>(create["~restrpc"].openApi);
expectType<typeof input>(create["~restrpc"].request.body);
expectType<"application/json">(create["~restrpc"].request.contentType);
expectType<typeof todo>(create["~restrpc"].responses[201].body);
expectType<typeof unauthorized>(create["~restrpc"].responses[401].body);
expectAssignable<RouteDeclaration>(create["~restrpc"]);
expectAssignable<Contract>(create);
expectError(create.input(input));
expectError(create.output(todo));

// Routes without a declared response carry an empty response map.
const incompleteHttp = route.get("/incomplete");
expectAssignable<RouteDeclaration>(incompleteHttp["~restrpc"]);
expectAssignable<Contract>(incompleteHttp);

const flatGet = route.get("/search").input(scalarQuery).output(todo);
expectType<"input">(flatGet["~restrpc"].input);
expectType<"output">(flatGet["~restrpc"].output);
expectType<typeof scalarQuery>(flatGet["~restrpc"].request.query);
expectError(flatGet.query(scalarQuery));
expectError(flatGet.response(200, todo));
expectError(route.get("/search").body(input));
expectError(
	route.get("/search").input(scalarQuery, { contentType: "text/plain" }),
);
expectError(
	route.get("/search").input(schemaType<{ nested: { value: string } }>()),
);

// Preserves schema inference for form and multipart content types.
const importRoute = route
	.post("/imports")
	.body(input, { contentType: "application/x-www-form-urlencoded" })
	.response(201, customText, { contentType: "text/csv" });

expectType<typeof input>(importRoute["~restrpc"].request.body);
expectType<"application/x-www-form-urlencoded">(
	importRoute["~restrpc"].request.contentType,
);
expectType<typeof customText>(importRoute["~restrpc"].responses[201].body);

// Supports form and multipart body schemas.
const formSchema = route
	.post("/form-schema")
	.body(input, { contentType: "application/x-www-form-urlencoded" })
	.response(201);
expectType<typeof input>(formSchema["~restrpc"].request.body);
const multipartSchema = route
	.post("/multipart-schema")
	.body(input, { contentType: "multipart/form-data" })
	.response(201);
expectType<typeof input>(multipartSchema["~restrpc"].request.body);

// Preserves schema and content-type inference for custom request bodies.
const customRequestBody = route
	.post("/custom-body")
	.body(input, { contentType: "application/xml" })
	.response(201);
expectType<typeof input>(customRequestBody["~restrpc"].request.body);
expectType<"application/xml">(
	customRequestBody["~restrpc"].request.contentType,
);

expectError(route.post("/custom-body-schema").body(input, { invalid: true }));

// Custom response schemas constrain their output while preserving their input.
const transformedCustomText = z.number().transform(String);
const transformedCustomResponse = route
	.get("/transformed-custom-response")
	.response(200, transformedCustomText, { contentType: "text/plain" });
expectType<typeof transformedCustomText>(
	transformedCustomResponse["~restrpc"].responses[200].body,
);

// Preserves query and streaming response inference.
const search = route.get("/search").query(input).streamResponse(200, todo);
expectType<typeof todo>(search["~restrpc"].responses[200].body);
expectType<"stream">(search["~restrpc"].responses[200].kind);

// Ordinary params and query schemas accept scalar wire inputs.
const scalarRequest = route
	.get("/scalar/:accountId")
	.query(scalarQuery)
	.params(scalarParams)
	.response(200, todo);
expectType<typeof scalarQuery>(scalarRequest["~restrpc"].request.query);
expectType<typeof scalarParams>(scalarRequest["~restrpc"].request.params);

// Structured query inputs must use scalar or array wire values.
expectError(
	route
		.get("/nested-query")
		.query(schemaType<{ filters: { tags: string[] } }>()),
);
expectError(
	route.get("/array-param/:ids").params(schemaType<{ ids: string[] }>()),
);

// Preserves response body, stream, and typed response-header inference.
const typedResponses = route
	.get("/typed-responses")
	.response(200, todo, { headers: typedResponseHeaders })
	.streamResponse(201, customBytes);
expectType<typeof todo>(typedResponses["~restrpc"].responses[200].body);
expectType<typeof typedResponseHeaders>(
	typedResponses["~restrpc"].responses[200].headers,
);
expectType<typeof customBytes>(typedResponses["~restrpc"].responses[201].body);
expectError(
	route.get("/invalid-response-headers").response(200, todo, {
		headers: schemaType<{ invalid: { nested: string } }>(),
	}),
);

expectAssignable<RouteDeclaration>(
	route.get("/health").response(204)["~restrpc"],
);
expectAssignable<RouteDeclaration>(
	route.get("/health").response(204, undefined)["~restrpc"],
);
const noBodyWithHeaders = route.get("/created").response(204, undefined, {
	headers: typedResponseHeaders,
});
expectType<undefined>(noBodyWithHeaders["~restrpc"].responses[204].body);
expectType<typeof typedResponseHeaders>(
	noBodyWithHeaders["~restrpc"].responses[204].headers,
);

// Duplicate response status codes are allowed, but will throw at runtime.
// this is a tradeoff where guarding this at type level is significantly more
// expensive for tsc, and the rare case where someone accidentally creates a
// duplicate response status code does not justify increased compile time for all other cases.
const duplicateResponseStatus = route
	.get("/health")
	.response(200, todo)
	.response(200, event);

expectAssignable<RouteDeclaration>(duplicateResponseStatus["~restrpc"]);

// Supports mixed ordinary, custom-content, and streaming responses.
const mixedResponses = route
	.get("/responses")
	.response(200, todo)
	.response(201, customText, { contentType: "text/csv" })
	.streamResponse(202, event);

expectType<typeof todo>(mixedResponses["~restrpc"].responses[200].body);
expectType<typeof customText>(mixedResponses["~restrpc"].responses[201].body);
expectType<typeof event>(mixedResponses["~restrpc"].responses[202].body);
expectType<"stream">(mixedResponses["~restrpc"].responses[202].kind);
expectAssignable<RouteDeclaration>(mixedResponses["~restrpc"]);

// Keeps unused request and route configuration available after a response.
const configuredAfterResponse = route
	.post("/configured-after-response")
	.response(200, customText, { contentType: "text/plain" })
	.body(input)
	.query(schemaType<{ search: string }>())
	.params(schemaType<{ id: string }>())
	.headers(input)
	.metadata({ auth: true })
	.openAPI({ summary: "Configured after response" })
	.streamResponse(201, event);
expectType<typeof input>(configuredAfterResponse["~restrpc"].request.body);
expectType<typeof customText>(
	configuredAfterResponse["~restrpc"].responses[200].body,
);
expectType<typeof event>(
	configuredAfterResponse["~restrpc"].responses[201].body,
);
expectType<{ readonly auth: true }>(
	configuredAfterResponse["~restrpc"].metadata,
);
expectType<OpenApiRouteOptions>(configuredAfterResponse["~restrpc"].openApi);
expectAssignable<RouteDeclaration>(configuredAfterResponse["~restrpc"]);

// Keeps HTTP body and query setters mutually exclusive.
const bodyUsed = route.post("/body-used").body(input);
expectError(bodyUsed.body(input, { contentType: "text/plain" }));
expectError(route.get("/query-used").query(input).query(input));

// Allows each HTTP request setter only once regardless of response order.
const singleUseHttpConfigured = route
	.get("/single-use-http")
	.query(input)
	.params(input)
	.headers(input)
	.metadata({ auth: true })
	.openAPI({ summary: "single use" });
expectError(singleUseHttpConfigured.params(input));
expectError(singleUseHttpConfigured.headers(input));
expectError(singleUseHttpConfigured.requestKeys);
expectError(singleUseHttpConfigured.metadata({ auth: true }));
expectError(singleUseHttpConfigured.openAPI({ summary: "again" }));
expectAssignable<RouteDeclaration>(
	singleUseHttpConfigured.response(200)["~restrpc"],
);

expectError(route.get("/health").response(todo));
expectError(route.input(input, "text/plain"));
expectError(route.post("/todos").responses({ 201: todo }));
