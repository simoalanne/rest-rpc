import {
	safe,
	type,
	type InferClientError,
	type InferClientRequest,
	type InferClientResponse,
} from "@rest-rpc/core";
import { call, createLocalClient, type CallOptions } from "./call.ts";
import {
	RequestValidationFailed,
	type RequestValidationIssues,
} from "./errors.ts";
import { route } from "../builder/routeBuilder.ts";

const withRequest = route
	.post("/items/{id}")
	.params(type<{ id: string }>())
	.body({
		"text/plain": type<string>(),
		"application/json": type<{ name: string }>(),
	})
	.handler(() => "ok");

const withContext = route
	.$context<{ user: string }>()
	.get("/")
	.handler(() => "ok");

describe("call types", () => {
	it("returns the client response of the route", () => {
		expectTypeOf(
			call(withRequest, {
				contentType: "text/plain",
				params: { id: "1" },
				body: "a",
			}),
		).resolves.toEqualTypeOf<InferClientResponse<typeof withRequest>>();
	});

	it("rejects with the client errors of the route", async () => {
		const { error } = await safe(call(withContext));
		expectTypeOf(error).toEqualTypeOf<
			InferClientError<typeof withContext> | Error | undefined
		>();
	});

	it("types the data of declared built-in errors", () => {
		const declared = route
			.post("/")
			.body(type<{ name: string }>())
			.error(RequestValidationFailed)
			.handler(() => "ok");
		expectTypeOf<
			Extract<
				InferClientError<typeof declared>,
				{ code: "REQUEST_VALIDATION_FAILED" }
			>["data"]
		>().toEqualTypeOf<RequestValidationIssues>();
	});

	it("requires the request only when the client requires it", () => {
		call(withContext);
		// @ts-expect-error params and body are required
		call(withRequest);
	});

	it("accepts a partial context", () => {
		expectTypeOf<CallOptions<typeof withContext>["context"]>().toEqualTypeOf<
			{ user?: string } | undefined
		>();
	});
});

describe("createLocalClient types", () => {
	it("mirrors the route tree with call() arguments at each leaf", () => {
		const client = createLocalClient({ items: { create: withRequest } });
		expectTypeOf(client.items.create).parameters.toEqualTypeOf<
			[
				request: InferClientRequest<typeof withRequest>,
				options?: CallOptions<typeof withRequest>,
			]
		>();
	});
});
