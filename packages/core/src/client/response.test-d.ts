import { route } from "../contract/routeBuilder.ts";
import { type } from "../standard-schema/type.ts";
import type { SseEvent } from "../sse.ts";
import type { InferClientResponse } from "./response.ts";

describe("client response inference", () => {
	it("uses transformed schema outputs in response unions", () => {
		const value = route
			.get("/")
			.response(
				200,
				type((input: string) => Number(input)),
				{
					contentType: ["text/plain", "application/json"],
					headers: type((input: { count: string }) => ({
						count: Number(input.count),
					})),
				},
			)
			.response(204)
			.response(404, type<{ message: string }>());
		type Client = InferClientResponse<typeof value>;
		expectTypeOf<Client["status"]>().toEqualTypeOf<200 | 204 | 404>();
		expectTypeOf<
			Extract<Client, { status: 200 }>["body"]
		>().toEqualTypeOf<number>();
		expectTypeOf<
			Extract<Client, { status: 200 }>["responseHeaders"]
		>().toEqualTypeOf<{ count: number }>();
		expectTypeOf<
			Extract<Client, { status: 204 }>["body"]
		>().toEqualTypeOf<undefined>();
		expectTypeOf<Extract<Client, { status: 404 }>["body"]>().toEqualTypeOf<{
			message: string;
		}>();
	});

	it("uses transformed schema outputs for streams and custom outputs", () => {
		const stream = route.get("/").streamResponse(
			200,
			type((input: string) => Number(input)),
		);
		expectTypeOf<InferClientResponse<typeof stream>["body"]>().toEqualTypeOf<
			AsyncIterable<SseEvent<number>>
		>();
		const plain = route.output(
			type((input: string) => Number(input)),
			{ contentType: "text/plain" },
		);
		expectTypeOf<InferClientResponse<typeof plain>>().toEqualTypeOf<number>();
	});
});
