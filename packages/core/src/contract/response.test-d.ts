import { route } from "./routeBuilder.ts";
import { type } from "../standard-schema/type.ts";
import type { InferServerResponse } from "./response.ts";

describe("response inference", () => {
	it("uses schema inputs in response unions", () => {
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
		type Server = InferServerResponse<typeof value>;
		expectTypeOf<Server["status"]>().toEqualTypeOf<200 | 204 | 404>();
		expectTypeOf<
			Extract<Server, { status: 200 }>["body"]
		>().toEqualTypeOf<string>();
		expectTypeOf<
			Extract<Server, { status: 200 }>["responseHeaders"]
		>().toEqualTypeOf<{ count: string }>();
		expectTypeOf<
			Extract<Server, { status: 200 }>["contentType"]
		>().toEqualTypeOf<"text/plain" | "application/json">();
		expectTypeOf<Extract<Server, { status: 204 }>>().toEqualTypeOf<{
			status: 204;
		}>();
		expectTypeOf<Extract<Server, { status: 404 }>["body"]>().toEqualTypeOf<{
			message: string;
		}>();
	});

	it("uses schema inputs for streams and plain custom outputs", () => {
		const stream = route.get("/").streamResponse(
			200,
			type((input: string) => Number(input)),
		);
		expectTypeOf<InferServerResponse<typeof stream>["body"]>().toEqualTypeOf<
			AsyncIterable<string>
		>();
		const plain = route.output(
			type((input: string) => Number(input)),
			{ contentType: "text/plain" },
		);
		expectTypeOf<InferServerResponse<typeof plain>>().toEqualTypeOf<{
			data: string;
			contentType: "text/plain";
		}>();
	});
});
