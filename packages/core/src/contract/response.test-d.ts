import { route } from "./routeBuilder.ts";
import { type } from "../standard-schema/type.ts";
import type { ServerResponse } from "./response.ts";

describe("response inference", () => {
	it("uses schema inputs in response unions", () => {
		const value = route
			.get("/")
			.response(
				type((input: string) => Number(input)),
				{
					contentType: ["text/plain", "application/json"],
					headers: type((input: { count: string }) => ({
						count: Number(input.count),
					})),
				},
			)
			.response({ status: 204 })
			.response(type<{ message: string }>(), { status: 404 });
		type Server = ServerResponse<(typeof value)["~restrpc"]>;
		expectTypeOf<Server["status"]>().toEqualTypeOf<200 | 204 | 404>();
		expectTypeOf<
			Extract<Server, { status: 200 }>["body"]
		>().toEqualTypeOf<string>();
		expectTypeOf<Extract<Server, { status: 200 }>["headers"]>().toEqualTypeOf<{
			count: string;
		}>();
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

	it("uses schema inputs for streams", () => {
		const stream = route
			.get("/")
			.streamResponse(type((input: string) => Number(input)));
		expectTypeOf<
			ServerResponse<(typeof stream)["~restrpc"]>["body"]
		>().toEqualTypeOf<AsyncIterable<string>>();
	});
});
