import { route } from "../contract/routeBuilder.ts";
import { type } from "../standard-schema/type.ts";
import type { SseEvent } from "../sse.ts";
import type {
	InferClientError,
	InferClientResponse,
	InferClientStreamData,
	InferClientSuccess,
} from "./response.ts";

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

	it("infers results for a route tree", () => {
		const get = route.get("/").output(type<string>());
		const tree = { users: { get } };
		expectTypeOf<
			InferClientResponse<typeof tree>["users"]["get"]
		>().toEqualTypeOf<InferClientResponse<typeof get>>();
	});

	it("splits declared responses into success and error results", () => {
		const value = route
			.get("/")
			.response(200, type<{ name: string }>())
			.response(204)
			.response(404, type<{ message: string }>());
		expectTypeOf<InferClientSuccess<typeof value>>().toEqualTypeOf<
			| { status: 200; body: { name: string }; headers: Headers }
			| { status: 204; body: undefined; headers: Headers }
		>();
		expectTypeOf<InferClientError<typeof value>>().toEqualTypeOf<{
			status: 404;
			body: { message: string };
			headers: Headers;
		}>();
		const plain = route.output(type<string>());
		expectTypeOf<InferClientSuccess<typeof plain>>().toEqualTypeOf<string>();
		expectTypeOf<InferClientError<typeof plain>>().toEqualTypeOf<never>();
		const tree = { users: { value } };
		expectTypeOf<
			InferClientSuccess<typeof tree>["users"]["value"]
		>().toEqualTypeOf<InferClientSuccess<typeof value>>();
		expectTypeOf<
			InferClientError<typeof tree>["users"]["value"]
		>().toEqualTypeOf<InferClientError<typeof value>>();
	});

	it("unwraps stream event data", () => {
		const output = route.streamOutput(type((input: string) => Number(input)));
		const response = route
			.get("/")
			.streamResponse(200, type<{ value: number }>())
			.response(404, type<{ message: string }>());
		const plain = route.output(type<string>());
		expectTypeOf<
			InferClientStreamData<typeof output>
		>().toEqualTypeOf<number>();
		expectTypeOf<InferClientStreamData<typeof response>>().toEqualTypeOf<{
			value: number;
		}>();
		expectTypeOf<InferClientStreamData<typeof plain>>().toEqualTypeOf<never>();
		const tree = { events: { output, response } };
		expectTypeOf<
			InferClientStreamData<typeof tree>["events"]["output"]
		>().toEqualTypeOf<number>();
	});
});
