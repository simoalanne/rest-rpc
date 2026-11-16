import { route } from "./routeBuilder.ts";
import { sse } from "./sse.ts";
import { type } from "../standard-schema/type.ts";
import type { ServerResponse } from "./response.ts";

describe("response inference", () => {
	it("uses schema inputs in response unions", () => {
		const value = route
			.get("/")
			.response(
				type((input: string | { value: number }) => input),
				{
					headers: type(
						(input: {
							count: string;
							"content-type": "text/plain" | "application/json";
						}) => ({ ...input, count: Number(input.count) }),
					),
				},
			)
			.response({ status: 204 })
			.response(type<{ id: string }>(), { status: 201 });
		type Server = ServerResponse<(typeof value)["~restrpc"]>;
		expectTypeOf<Server["status"]>().toEqualTypeOf<200 | 201 | 204>();
		expectTypeOf<Extract<Server, { status: 200 }>>().toEqualTypeOf<{
			status: 200;
			body: string | { value: number };
			headers: {
				count: string;
				"content-type": "text/plain" | "application/json";
			};
		}>();
		expectTypeOf<Extract<Server, { status: 204 }>>().toEqualTypeOf<{
			status: 204;
		}>();
		expectTypeOf<Extract<Server, { status: 201 }>>().toEqualTypeOf<{
			status: 201;
			body: { id: string };
		}>();
	});

	it("uses schema inputs for streams", () => {
		const stream = route
			.get("/")
			.response(sse(type((input: string) => Number(input))));
		expectTypeOf<
			ServerResponse<(typeof stream)["~restrpc"]>["body"]
		>().toEqualTypeOf<AsyncIterable<string>>();
	});
});
