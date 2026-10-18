import { route } from "../contract/routeBuilder.ts";
import { type } from "../standard-schema/type.ts";
import type { SseEvent } from "../contract/sse.ts";
import type { StandardSchemaV1 } from "../standard-schema/index.ts";
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
		type Client = InferClientResponse<typeof value>;
		expectTypeOf<Client["status"]>().toEqualTypeOf<200 | 204 | 404>();
		expectTypeOf<
			Extract<Client, { status: 200 }>["body"]
		>().toEqualTypeOf<number>();
		expectTypeOf<Extract<Client, { status: 200 }>["headers"]>().toEqualTypeOf<
			Record<string, string> & { count: number }
		>();
		expectTypeOf<
			Extract<Client, { status: 204 }>["body"]
		>().toEqualTypeOf<undefined>();
		expectTypeOf<Extract<Client, { status: 404 }>["body"]>().toEqualTypeOf<{
			message: string;
		}>();
	});

	it("uses transformed schema outputs for streams", () => {
		const stream = route
			.get("/")
			.streamResponse(type((input: string) => Number(input)));
		expectTypeOf<InferClientResponse<typeof stream>["body"]>().toEqualTypeOf<
			AsyncIterable<SseEvent<number>>
		>();
	});

	it("infers results for a route tree", () => {
		const get = route.get("/").response(type<string>());
		const tree = { users: { get } };
		expectTypeOf<
			InferClientResponse<typeof tree>["users"]["get"]
		>().toEqualTypeOf<InferClientResponse<typeof get>>();
	});

	it("splits declared responses into success and error results", () => {
		const value = route
			.get("/")
			.response(type<{ name: string }>())
			.response({ status: 204 })
			.response(type<{ message: string }>(), { status: 404 });
		expectTypeOf<InferClientSuccess<typeof value>>().toEqualTypeOf<
			| { status: 200; body: { name: string }; headers: Record<string, string> }
			| { status: 204; body: undefined; headers: Record<string, string> }
		>();
		expectTypeOf<InferClientError<typeof value>>().toEqualTypeOf<{
			status: 404;
			body: { message: string };
			headers: Record<string, string>;
		}>();
		const tree = { users: { value } };
		expectTypeOf<
			InferClientSuccess<typeof tree>["users"]["value"]
		>().toEqualTypeOf<InferClientSuccess<typeof value>>();
		expectTypeOf<
			InferClientError<typeof tree>["users"]["value"]
		>().toEqualTypeOf<InferClientError<typeof value>>();
	});

	it("unwraps stream event data", () => {
		const output = route.streamResponse(type((input: string) => Number(input)));
		const response = route
			.get("/")
			.streamResponse(type<{ value: number }>())
			.response(type<{ message: string }>(), { status: 404 });
		const plain = route.response(type<string>());
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

	it("types event-stream content as a stream and keeps non-literal statuses on both sides", () => {
		const raw = route.get("/").response(type<string>(), {
			contentType: "text/event-stream",
		});
		expectTypeOf<InferClientResponse<typeof raw>["body"]>().toEqualTypeOf<
			AsyncIterable<SseEvent<unknown>>
		>();
		type Wide = {
			readonly "~restrpc": {
				method: "GET";
				path: "/";
				responses: { [status: number]: { body: StandardSchemaV1<string> } };
			};
		};
		expectTypeOf<InferClientSuccess<Wide>["status"]>().toEqualTypeOf<number>();
		expectTypeOf<InferClientError<Wide>["status"]>().toEqualTypeOf<number>();
	});
});
