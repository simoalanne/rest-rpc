import { route } from "./routeBuilder.ts";
import { type } from "../standard-schema/type.ts";
import type { ServerResponse } from "./response.ts";

describe("response inference", () => {
	it("uses schema inputs in response unions", () => {
		const value = route
			.get("/")
			.response(
				{
					"text/plain": type((input: string) => Number(input)),
					"application/json": type<{ value: number }>(),
				},
				{
					headers: type((input: { count: string }) => ({
						count: Number(input.count),
					})),
				},
			)
			.response({ status: 204 })
			.response(type<{ id: string }>(), { status: 201 });
		type Server = ServerResponse<(typeof value)["~restrpc"]>;
		expectTypeOf<Server["status"]>().toEqualTypeOf<200 | 201 | 204>();
		expectTypeOf<Extract<Server, { status: 200 }>>().toEqualTypeOf<
			| {
					status: 200;
					contentType: "text/plain";
					body: string;
					headers: { count: string };
			  }
			| {
					status: 200;
					contentType: "application/json";
					body: { value: number };
					headers: { count: string };
			  }
		>();
		expectTypeOf<Extract<Server, { status: 204 }>>().toEqualTypeOf<{
			status: 204;
		}>();
		expectTypeOf<Extract<Server, { status: 201 }>>().toEqualTypeOf<{
			status: 201;
			contentType?: "application/json";
			body: { id: string };
		}>();
	});

	it("uses schema inputs for streams", () => {
		const stream = route
			.get("/")
			.streamResponse(type((input: string) => Number(input)));
		expectTypeOf<
			ServerResponse<(typeof stream)["~restrpc"]>["body"]
		>().toEqualTypeOf<AsyncIterable<string>>();
	});
});
