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

	it("infers plain, stream, and SSE data independently of metadata", () => {
		const plain = route.handler(() => ({ id: "one" }));
		async function* chunks() {
			yield sse({ data: { count: 1 }, id: "one" });
		}
		const stream = route.handler(chunks);
		const envelope = route
			.get("/")
			.handler(() => ({ status: 200, body: chunks() }));
		expectTypeOf<InferClientResponse<typeof plain>>().toEqualTypeOf<{
			status: 200;
			body: { readonly id: "one" };
			rawHeaders: Headers;
		}>();
		expectTypeOf<InferClientResponse<typeof stream>["body"]>().toEqualTypeOf<
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
			InferClientResponse<typeof stream>["body"]
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

	it("infers plain bodies and envelopes per returned member", () => {
		const mixed = route
			.get("/")
			.handler(() =>
				Math.random() > 0.5
					? { id: "one" }
					: { status: 404, body: { message: "missing" } },
			);
		type Client = InferClientResponse<typeof mixed>;
		expectTypeOf<Client["status"]>().toEqualTypeOf<200 | 404>();
		expectTypeOf<Extract<Client, { status: 200 }>["body"]>().toEqualTypeOf<{
			readonly id: "one";
		}>();
		const textStatus = route.handler(() => ({ id: "one", status: "open" }));
		expectTypeOf<InferClientResponse<typeof textStatus>>().toEqualTypeOf<{
			status: 200;
			body: { readonly id: "one"; readonly status: "open" };
			rawHeaders: Headers;
		}>();
	});

	it("rejects invalid envelope headers", () => {
		// @ts-expect-error Response headers must be transport scalars.
		route.handler(() => ({ status: 200, headers: { count: {} } }));
	});
});
