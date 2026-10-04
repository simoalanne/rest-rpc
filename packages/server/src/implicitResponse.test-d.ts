import {
	type InferClientResponse,
	type InferServerResponse,
} from "@rest-rpc/core";
import { serverRoute as route } from "./routeBuilder.ts";
import type { ImplicitResponseKind } from "./implicitResponse.types.ts";
import { sse } from "./sse.ts";

describe("implicit response inference", () => {
	it("preserves sync and async status unions and error envelopes", () => {
		const sync = route
			.get("/")
			.handler(() =>
				Math.random() > 0.5
					? ({ status: 201, body: { id: "new" } } as const)
					: ({ status: 404, body: { message: "missing" } } as const),
			);
		const asyncRoute = route
			.get("/")
			.handler(async () =>
				Math.random() > 0.5
					? ({ status: 201, body: { id: "new" } } as const)
					: ({ status: 404, body: { message: "missing" } } as const),
			);
		expectTypeOf<InferClientResponse<typeof sync>>().toEqualTypeOf<
			InferClientResponse<typeof asyncRoute>
		>();
		expectTypeOf<InferClientResponse<typeof sync>["status"]>().toEqualTypeOf<
			201 | 404
		>();
	});

	it("infers empty bodies, custom media, and serialized response headers", () => {
		const empty = route.get("/").handler(() => ({ status: 204 }));
		expectTypeOf<InferServerResponse<typeof empty>>().toEqualTypeOf<{
			status: 204;
		}>();
		expectTypeOf<
			InferClientResponse<typeof empty>["body"]
		>().toEqualTypeOf<undefined>();
		const custom = route.get("/").handler(() => ({
			status: 200,
			body: "ok",
			contentType: "text/plain",
			headers: { count: 2, omitted: undefined },
		}));
		expectTypeOf<
			InferClientResponse<typeof custom>["headers"]
		>().toEqualTypeOf<{
			readonly count: "2";
			readonly omitted: undefined;
		}>();
		expectTypeOf<
			InferServerResponse<typeof custom>["headers"]
		>().toEqualTypeOf<{
			readonly count: 2;
			readonly omitted: undefined;
		}>();
	});

	it("infers plain, custom, stream, and SSE data independently of metadata", () => {
		const plain = route.handler(() => ({ id: "one" }));
		const custom = route.handler(async () => ({
			contentType: "text/plain",
			data: "hello",
		}));
		async function* chunks() {
			yield sse({ data: { count: 1 }, id: "one" });
		}
		const stream = route.handler(chunks);
		const envelope = route
			.get("/")
			.handler(() => ({ status: 200, body: chunks() }));
		expectTypeOf<InferClientResponse<typeof plain>>().toEqualTypeOf<{
			readonly id: "one";
		}>();
		expectTypeOf<InferClientResponse<typeof custom>>().toEqualTypeOf<"hello">();
		expectTypeOf<InferClientResponse<typeof stream>>().toEqualTypeOf<
			AsyncIterable<{
				data: { count: number };
				id?: string;
				event?: string;
				retry?: number;
			}>
		>();
		expectTypeOf<
			InferClientResponse<typeof envelope>["status"]
		>().toEqualTypeOf<200>();
		expectTypeOf<InferClientResponse<typeof envelope>["body"]>().toEqualTypeOf<
			InferClientResponse<typeof stream>
		>();
		expectTypeOf<
			ImplicitResponseKind<
				| { status: 204 }
				| { body: string }
				| { body: AsyncIterable<number> }
				| { body: string; contentType: "text/plain" }
			>
		>().toEqualTypeOf<"empty" | "json" | "stream" | "custom">();
	});

	it("rejects mixed output modes, invalid statuses, and invalid headers", () => {
		// @ts-expect-error A handler must use a single output mode.
		route.handler(() =>
			Math.random() > 0.5 ? "plain" : { status: 200, body: "envelope" },
		);
		// @ts-expect-error Status envelopes require a number.
		route.handler(() => ({ status: "200", body: "bad" }));
		// @ts-expect-error Response headers must be transport scalars.
		route.handler(() => ({ status: 200, headers: { count: {} } }));
	});
});
