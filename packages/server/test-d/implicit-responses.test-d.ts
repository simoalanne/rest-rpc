import type { RouteDeclaration } from "@rest-rpc/core";
import {
	type InferredRouteResponse,
	type ServerFirstRouteResponseKind,
	serverFirstRoute as route,
} from "@rest-rpc/server";
import { sseEvent } from "@rest-rpc/server";
import { expectAssignable, expectError, expectNever, expectType } from "tsd";
import { z } from "zod";

// synchronous JSON handlers preserve status and body literals
const json = route.get("/json").handler(() => ({
	status: 200,
	body: { type: "todo", id: "todo-1" },
}));

type JsonResponse = InferredRouteResponse<typeof json>;
declare const jsonResponse: JsonResponse;
expectType<200>(jsonResponse.status);
expectType<"todo">(jsonResponse.body.type);
expectAssignable<RouteDeclaration>(
	null as unknown as NonNullable<typeof json.clientRoute>,
);
expectType<"json">(
	null as unknown as ServerFirstRouteResponseKind<typeof json>,
);

// asynchronous handlers retain their awaited response rather than Promise metadata
const asyncJson = route.post("/async-json").handler(async () => ({
	status: 201,
	body: { type: "created" },
}));

type AsyncJsonResponse = InferredRouteResponse<typeof asyncJson>;
declare const asyncJsonResponse: AsyncJsonResponse;
expectType<201>(asyncJsonResponse.status);
expectType<"created">(asyncJsonResponse.body.type);

// variants with different statuses remain a discriminated union
const multipleStatuses = route
	.get("/multiple-statuses")
	.handler(() =>
		(true as boolean)
			? { status: 200, body: { type: "found", id: "todo-1" } }
			: { status: 404, body: { type: "missing", code: "NOT_FOUND" } },
	);

type MultipleStatusesResponse = InferredRouteResponse<typeof multipleStatuses>;
declare const multipleStatusesResponse: MultipleStatusesResponse;
if (multipleStatusesResponse.status === 200) {
	expectType<"found">(multipleStatusesResponse.body.type);
	expectType<"todo-1">(multipleStatusesResponse.body.id);
} else {
	expectType<404>(multipleStatusesResponse.status);
	expectType<"missing">(multipleStatusesResponse.body.type);
	expectType<"NOT_FOUND">(multipleStatusesResponse.body.code);
}

// variants sharing a status remain a body-discriminated union
const sameStatus = route
	.get("/same-status")
	.handler(() =>
		(true as boolean)
			? { status: 200, body: { type: "todo", id: "todo-1" } }
			: { status: 200, body: { type: "project", id: "project-1" } },
	);

type SameStatusResponse = InferredRouteResponse<typeof sameStatus>;
declare const sameStatusResponse: SameStatusResponse;
if (sameStatusResponse.body.type === "todo") {
	expectType<"todo-1">(sameStatusResponse.body.id);
} else {
	expectType<"project">(sameStatusResponse.body.type);
	expectType<"project-1">(sameStatusResponse.body.id);
}

// an absent body is classified as an empty response
const empty = route.delete("/empty").handler(() => ({ status: 204 }));
type EmptyResponse = InferredRouteResponse<typeof empty>;
declare const emptyResponse: EmptyResponse;
expectType<204>(emptyResponse.status);
expectType<"empty">(
	null as unknown as ServerFirstRouteResponseKind<typeof empty>,
);

const todoStream = async function* () {
	yield { id: "todo-1", type: "todo" as const };
};

// async-iterable bodies without contentType are NDJSON streams
const ndjson = route.get("/ndjson").handler(() => ({
	status: 200,
	body: todoStream(),
}));
expectType<"ndjson">(
	null as unknown as ServerFirstRouteResponseKind<typeof ndjson>,
);
type NdjsonResponse = InferredRouteResponse<typeof ndjson>;
declare const ndjsonResponse: NdjsonResponse;
expectType<AsyncGenerator<{ id: string; type: "todo" }, void, unknown>>(
	ndjsonResponse.body,
);

// contentType selects custom responses and custom streams
const custom = route.get("/custom").handler(() => ({
	status: 200,
	contentType: "text/csv",
	body: "id,title\ntodo-1,Write tests",
}));
expectType<"custom">(
	null as unknown as ServerFirstRouteResponseKind<typeof custom>,
);
type CustomResponse = InferredRouteResponse<typeof custom>;
declare const customResponse: CustomResponse;
expectType<"text/csv">(customResponse.contentType);

const customStream = route.get("/custom-stream").handler(() => ({
	status: 200,
	contentType: "text/plain",
	body: todoStream(),
}));
expectType<"custom-stream">(
	null as unknown as ServerFirstRouteResponseKind<typeof customStream>,
);

// SSE event payloads are inferred when no response schema is declared
const inferredSse = route.sse("/inferred-events").handler(async function* () {
	yield sseEvent({ id: "todo-1", type: "todo" as const });
});
expectType<"sse">(
	null as unknown as ServerFirstRouteResponseKind<typeof inferredSse>,
);
expectAssignable<RouteDeclaration>(
	null as unknown as NonNullable<typeof inferredSse.clientRoute>,
);
expectError(
	route.sse("/invalid-events").handler(async function* () {
		yield { data: { id: "todo-1" } };
	}),
);

// Explicit SSE schemas retain their existing async-generator handler model
const sse = route
	.sse("/events")
	.response(z.object({ id: z.string() }))
	.handler(async function* () {
		yield sseEvent({ id: "todo-1" });
	});
expectType<"sse">(null as unknown as ServerFirstRouteResponseKind<typeof sse>);

// declared responses remain authoritative and are excluded from implicit inference
const declared = route
	.get("/declared")
	.response(200, z.object({ id: z.string() }))
	.handler(() => ({ status: 200, body: { id: "todo-1" } }));
expectNever(null as unknown as InferredRouteResponse<typeof declared>);

expectAssignable<RouteDeclaration>(
	null as unknown as NonNullable<typeof declared.clientRoute>,
);

// response headers are included in inferred response declarations
const withResponseHeaders = route.get("/with-response-headers").handler(() => ({
	status: 200,
	body: { id: "todo-1" },
	responseHeaders: { etag: "todo-1", "x-page": 1 },
}));
type WithResponseHeaders = InferredRouteResponse<typeof withResponseHeaders>;
declare const withResponseHeadersResponse: WithResponseHeaders;
expectType<"todo-1">(withResponseHeadersResponse.responseHeaders.etag);
expectType<1>(withResponseHeadersResponse.responseHeaders["x-page"]);
expectError(
	route.get("/invalid-response-headers").handler(() => ({
		status: 200,
		body: { id: "todo-1" },
		responseHeaders: { enabled: true },
	})),
);

// implicit HTTP handlers must return explicit status envelopes
expectError(route.get("/direct-body").handler(() => ({ id: "todo-1" })));
expectError(route.get("/missing-status").handler(() => ({ body: "invalid" })));
