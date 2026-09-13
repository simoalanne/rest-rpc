import type { StandardSchemaV1 } from "@rest-rpc/core/standard-schema";
import { initClient, route as coreRoute } from "@rest-rpc/core";
import {
	serverFirstRoute,
	type RouteResponse,
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
	StandardSchemaV1<unknown, { readonly id: string; readonly title: string }>
>(inferred["~restrpc"].responses[201]);
expectType<201>(
	inferred["~restrpc"].handler({
		params: { id: "todo-1" },
		body: { title: "Write tests" },
		context: { requestId: "request-1" },
		signal: new AbortController().signal,
		route: inferred["~restrpc"],
	}).status,
);

const declared = route
	.post("/declared")
	.body(input)
	.response(201, output)
	.handler(({ body }) => ({
		status: 201 as const,
		body: { id: "todo-1", title: body.title },
	}));
expectType<typeof output>(declared["~restrpc"].responses[201]);
const declaredNoBody = route.get("/declared-no-body").response(204);
expectType<{ status: 204 }>(
	null as unknown as RouteResponse<(typeof declaredNoBody)["~restrpc"]>,
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
	StandardSchemaV1<unknown, { readonly id: "todo-1"; readonly title: string }>
>(procedure["~restrpc"].responses[200]);

route.output(output).handler(() => ({ id: "todo-1", title: "Todo" }));
expectError(route.output(output).handler(() => ({ id: 1, title: "Todo" })));

expectError(serverFirstRoute.with({ pathPrefix: "/v1" }).handler(() => null));

const client = initClient<{
	create: typeof inferred;
	get: typeof procedure;
}>({ baseUrl: "https://example.test" });
expectType<Promise<{ readonly id: "todo-1"; readonly title: string }>>(
	client.get({ title: "Todo" }),
);
expectType<
	Promise<{
		status: 201;
		body: { readonly id: string; readonly title: string };
		headers: Headers;
	}>
>(
	client.$post("/todos/:id", {
		params: { id: "todo-1" },
		body: { title: "Todo" },
	}),
);
