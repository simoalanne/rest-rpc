import type { StandardSchemaV1 } from "@rest-rpc/core/standard-schema";
import {
	type InferClientRequest,
	type InferClientResponse,
	type SseEvent,
	initClient,
	route as coreRoute,
} from "@rest-rpc/core";
import {
	sse,
	serverFirstRoute,
	type InferServerRequest,
	type InferServerResponse,
	type RouteErrors,
	type ServerFirstRouteResponseKind,
	type ServerRouteBuilder,
} from "@rest-rpc/server";
import { expectError, expectType } from "tsd";
import { z } from "zod";

interface AppContext {
	requestId: string;
}

const route = serverFirstRoute as unknown as ServerRouteBuilder<
	{ signal: AbortSignal },
	AppContext
>;
const input = z.object({ title: z.string() });
const output = z.object({ id: z.string(), title: z.string() });

expectError(coreRoute.handler(() => undefined));

const rootProcedure = route.handler(({ context }) => ({
	id: "todo-1" as const,
	requestId: context.requestId,
}));
expectType<"procedure">(rootProcedure["~restrpc"].kind);

const inferred = route
	.post("/todos/:id")
	.params(z.object({ id: z.string() }))
	.body(input)
	.handler(({ params, body, context, signal, route }) => {
		expectType<string>(params.id);
		expectType<string>(body.title);
		expectType<AppContext>(context);
		expectType<AbortSignal>(signal);
		expectType<"http">(route.kind);
		expectType<"POST">(route.method);
		expectType<"/todos/:id">(route.path);
		return { status: 201 as const, body: { id: params.id, title: body.title } };
	});

expectType<"POST">(inferred["~restrpc"].method);
expectType<"/todos/:id">(inferred["~restrpc"].path);
expectType<
	StandardSchemaV1<
		{ readonly id: string; readonly title: string },
		{ readonly id: string; readonly title: string }
	>
>(inferred["~restrpc"].responses[201].body);
expectType<201>(
	inferred["~restrpc"].handler({
		params: { id: "todo-1" },
		body: { title: "Write tests" },
		context: { requestId: "request-1" },
		signal: new AbortController().signal,
		route: inferred["~restrpc"],
	}).status,
);

const inferredStream = route.get("/events").handler(() => ({
	status: 200 as const,
	body: (async function* () {
		yield { id: "event-1" };
	})(),
}));
expectType<"stream">(inferredStream["~restrpc"].responses[200].kind);

const declared = route
	.post("/declared")
	.body(input)
	.response(201, output)
	.handler(({ body }) => ({
		status: 201 as const,
		body: { id: "todo-1", title: body.title },
	}));
expectType<typeof output>(declared["~restrpc"].responses[201].body);
const declaredNoBody = route.get("/declared-no-body").response(204);
expectType<{ status: 204 }>(
	null as unknown as InferServerResponse<typeof declaredNoBody>,
);
declaredNoBody.handler(() => ({ status: 204 }));
expectError(
	route
		.get("/invalid")
		.response(200, output)
		.handler(() => ({ status: 404 as const, body: { code: "missing" } })),
);

const procedure = route
	.input(input)
	.handler(({ input: procedureInput, context }) => {
		expectType<string>(procedureInput.title);
		expectType<string>(context.requestId);
		return { id: "todo-1", title: procedureInput.title };
	});
expectType<"procedure">(procedure["~restrpc"].kind);
expectType<
	StandardSchemaV1<
		{ readonly id: "todo-1"; readonly title: string },
		{ readonly id: "todo-1"; readonly title: string }
	>
>(procedure["~restrpc"].responses[200].body);

const flatGet = route
	.get("/todos")
	.input(z.object({ id: z.string() }))
	.output(output)
	.handler(({ input: flatInput }) => ({ id: flatInput.id, title: "Todo" }));
expectType<"input">(flatGet["~restrpc"].input);
expectType<"output">(flatGet["~restrpc"].output);
expectType<Promise<{ id: string; title: string }>>(
	initClient({ flatGet }, { baseUrl: "https://example.test" }).flatGet({
		id: "todo-1",
	}),
);

const derivedResponse = route
	.query(z.object({ search: z.string() }))
	.response(201, output)
	.handler(({ query }) => ({
		status: 201 as const,
		body: { id: "1", title: query.search },
	}));
expectType<"segments">(derivedResponse["~restrpc"].input);
expectType<"response">(derivedResponse["~restrpc"].output);
expectError(
	route.handler(() =>
		Math.random() > 0.5 ? { status: 200, body: "ok" } : "ok",
	),
);

route.output(output).handler(() => ({ id: "todo-1", title: "Todo" }));
expectError(route.output(output).handler(() => ({ id: 1, title: "Todo" })));

const declaredCustomProcedure = route
	.output(z.string(), { contentType: "text/plain" })
	.handler(() => ({ contentType: "text/plain", data: "todo data" }));
expectError(
	route.output(z.string(), { contentType: "text/plain" }).handler(() => "data"),
);
expectError(
	route
		.output(z.string(), { contentType: "text/plain" })
		.handler(() => ({ contentType: "text/csv", data: "todo data" })),
);
expectType<"custom">(
	null as unknown as ServerFirstRouteResponseKind<
		typeof declaredCustomProcedure
	>,
);

const declaredStreamProcedure = route.streamOutput(output).handler(() =>
	(async function* () {
		yield { id: "todo-1", title: "Todo" };
	})(),
);
expectError(
	route.streamOutput(output).handler(() => ({ id: "todo-1", title: "Todo" })),
);
expectType<"stream">(
	null as unknown as ServerFirstRouteResponseKind<
		typeof declaredStreamProcedure
	>,
);

const inferredCustomProcedure = route.handler(() => ({
	contentType: "text/plain" as const,
	data: "todo data",
}));
expectType<"text/plain">(
	inferredCustomProcedure["~restrpc"].responses[200].contentType,
);
expectType<"custom">(
	null as unknown as ServerFirstRouteResponseKind<
		typeof inferredCustomProcedure
	>,
);

const inferredStreamProcedure = route.handler(() =>
	(async function* () {
		yield { id: "event-1" as const };
	})(),
);
expectType<"stream">(inferredStreamProcedure["~restrpc"].responses[200].kind);
expectType<"stream">(
	null as unknown as ServerFirstRouteResponseKind<
		typeof inferredStreamProcedure
	>,
);

const procedureClient = initClient(
	{
		custom: inferredCustomProcedure,
		stream: inferredStreamProcedure,
	},
	{ baseUrl: "https://example.test" },
);
expectType<Promise<"todo data">>(procedureClient.custom());
expectType<Promise<AsyncIterable<SseEvent<{ id: "event-1" }>>>>(
	procedureClient.stream(),
);

const inferredWrappedStream = route.handler(() =>
	(async function* () {
		yield sse({ data: { id: "event-2" as const }, id: "wire-2" });
	})(),
);
const wrappedClient = initClient(
	{ stream: inferredWrappedStream },
	{ baseUrl: "https://example.test" },
);
expectType<Promise<AsyncIterable<SseEvent<{ id: "event-2" }>>>>(
	wrappedClient.stream(),
);

const generatedContract = {
	create: {
		"~restrpc": {
			source: "generated",
			kind: "http",
			method: "POST",
			path: "/todos/:id",
			request: { contentType: "application/json" },
			responses: { 201: {} },
		},
	},
	get: {
		"~restrpc": {
			source: "generated",
			kind: "procedure",
			method: "POST",
			path: "",
			request: { contentType: "application/json" },
			responses: { 200: {} },
		},
	},
} as unknown as { create: typeof inferred; get: typeof procedure };
const generatedClient = initClient(generatedContract, {
	baseUrl: "https://example.test",
});
expectType<
	Promise<{
		status: 201;
		body: { readonly id: string; readonly title: string };
		headers: Headers;
	}>
>(
	generatedClient.create({
		params: { id: "todo-1" },
		body: { title: "Todo" },
	}),
);
expectType<Promise<{ readonly id: "todo-1"; readonly title: string }>>(
	generatedClient.get({ title: "Todo" }),
);

// Public helpers accept builders and completed routes without unwrapping them.
const helperDeclaration = coreRoute
	.get("/todos/:id")
	.params(z.object({ id: z.string() }))
	.response(200, z.object({ id: z.string() }))
	.response(404, z.object({ code: z.literal("NOT_FOUND") }));
const helperImplementation = route
	.get("/todos/:id")
	.params(z.object({ id: z.string() }))
	.handler(({ params }) => ({ status: 200, body: { id: params.id } }));

expectType<{ params: { id: string } }>(
	null as unknown as InferClientRequest<typeof helperDeclaration>,
);
expectType<{ params: { id: string } }>(
	null as unknown as InferServerRequest<typeof helperDeclaration>,
);
expectType<{ status: 404; body: { code: "NOT_FOUND" } }>(
	null as unknown as RouteErrors<typeof helperDeclaration>,
);
expectType<
	| { status: 200; body: { id: string } }
	| { status: 404; body: { code: "NOT_FOUND" } }
>(null as unknown as InferServerResponse<typeof helperDeclaration>);
expectType<{ params: { id: string } }>(
	null as unknown as InferClientRequest<typeof helperImplementation>,
);
expectType<{ params: { id: string } }>(
	null as unknown as InferServerRequest<typeof helperImplementation>,
);
expectType<{ status: 200; body: { readonly id: string } }>(
	null as unknown as InferServerResponse<typeof helperImplementation>,
);
expectType<{ status: 200; body: { readonly id: string }; headers: Headers }>(
	null as unknown as InferClientResponse<typeof helperImplementation>,
);
expectType<never>(null as unknown as RouteErrors<typeof helperImplementation>);

const transformedInput = z
	.object({ id: z.string() })
	.transform(({ id }) => ({ id: Number(id) }));
const transformedOutput = z
	.object({ id: z.string() })
	.transform(({ id }) => ({ id: Number(id) }));
const helperProcedure = coreRoute
	.input(transformedInput)
	.output(transformedOutput);
const helperProcedureImplementation = route
	.input(transformedInput)
	.output(transformedOutput)
	.handler(({ input }) => ({ id: String(input.id) as "1" }));
expectType<{ id: string }>(
	null as unknown as InferClientRequest<typeof helperProcedure>,
);
expectType<{ input: { id: number } }>(
	null as unknown as InferServerRequest<typeof helperProcedure>,
);
expectType<{ id: string }>(
	null as unknown as InferServerResponse<typeof helperProcedure>,
);
expectType<{ id: number }>(
	null as unknown as InferClientResponse<typeof helperProcedure>,
);
expectType<{ id: string }>(
	null as unknown as InferServerResponse<typeof helperProcedureImplementation>,
);

// Internal declarations are not the public helper input.
expectError(
	null as unknown as InferClientRequest<(typeof helperDeclaration)["~restrpc"]>,
);
expectError(
	null as unknown as InferClientResponse<
		(typeof helperDeclaration)["~restrpc"]
	>,
);
expectError(
	null as unknown as InferServerRequest<(typeof helperDeclaration)["~restrpc"]>,
);
expectError(
	null as unknown as InferServerResponse<
		(typeof helperDeclaration)["~restrpc"]
	>,
);
expectError(
	null as unknown as RouteErrors<(typeof helperDeclaration)["~restrpc"]>,
);

// should have contextual typing for inline middleware
route
	.patch("/todos/:id")
	.params(z.object({ id: z.string() }))
	.headers(z.object({ authorization: z.string() }))
	.query(z.object({ search: z.string() }))
	.body(z.string())
	.use(
		({
			params,
			headers,
			query,
			body,
			contentType,
			lastEventId,
			context,
			next,
		}) => {
			expectType<string>(params.id);
			expectType<string>(headers.authorization);
			expectType<string>(query.search);
			expectType<string>(body);
			expectType<string | undefined>(contentType);
			expectType<string | undefined>(lastEventId);
			expectType<AppContext>(context);
			return next();
		},
	);

// should allow typing for reusable middleware
const reusableMiddleware = route.middleware<{
	headers: { id: string };
	params: { id: string };
}>(({ headers, params, body, query, contentType, lastEventId, next }) => {
	expectType<string>(headers.id);
	expectType<string>(params.id);
	expectType<unknown>(body);
	expectType<unknown>(query);
	expectType<string | undefined>(contentType);
	expectType<string | undefined>(lastEventId);
	return next();
});

// should reject usage of reusable middleware with missing required input types
expectError(route.use(reusableMiddleware));

// should allow it inside singular route handlers with the correct input types
route
	.headers(z.object({ id: z.string() }))
	.params(z.object({ id: z.string() }))
	.use(reusableMiddleware);

// should allow route with richer input types to use it as long as it has the required input types
route
	.headers(z.object({ id: z.string(), name: z.string() }))
	.params(z.object({ id: z.string(), name: z.string() }))
	.body(z.string())
	.use(reusableMiddleware);
