import { route } from "../contract/routeBuilder.ts";
import { type RouteError, routeError } from "../contract/routeError.ts";
import { type } from "../standard-schema/type.ts";
import type { SseEvent } from "../contract/sse.ts";
import type { StandardSchemaV1 } from "../standard-schema/index.ts";
import type {
	InferClientError,
	InferClientResponse,
	InferClientStreamData,
} from "./response.ts";

describe("client response inference", () => {
	it("uses transformed schema outputs in response unions", () => {
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
			.response({ status: 204 });
		type Client = InferClientResponse<typeof value>;
		expectTypeOf<Client["status"]>().toEqualTypeOf<200 | 204>();
		expectTypeOf<
			Extract<Client, { contentType: "text/plain" }>["body"]
		>().toEqualTypeOf<number>();
		expectTypeOf<
			Extract<Client, { contentType: "application/json"; status: 200 }>["body"]
		>().toEqualTypeOf<{ value: number }>();
		expectTypeOf<Extract<Client, { status: 200 }>["headers"]>().toEqualTypeOf<
			Record<string, string> & { count: number }
		>();
		expectTypeOf<Extract<Client, { status: 204 }>>().toEqualTypeOf<{
			status: 204;
			contentType: undefined;
			body: undefined;
			headers: Record<string, string>;
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

	it("infers defined errors from their schema outputs", () => {
		const NotFound = routeError("NOT_FOUND", {
			status: 404,
			data: type((input: number) => String(input)),
			headers: type((input: { retry: string }) => ({
				retry: Number(input.retry),
			})),
		});
		const value = route
			.get("/")
			.error(NotFound)
			.error("CONFLICT", { status: 409 });
		expectTypeOf<InferClientError<typeof value>>().toEqualTypeOf<
			| RouteError<
					"NOT_FOUND",
					string,
					404,
					Record<string, string> & { retry: number }
			  >
			| RouteError<"CONFLICT", undefined, 409, Record<string, string>>
		>();
		const plain = route.get("/");
		expectTypeOf<InferClientError<typeof plain>>().toBeNever();
		const tree = { users: { value } };
		expectTypeOf<
			InferClientError<typeof tree>["users"]["value"]
		>().toEqualTypeOf<InferClientError<typeof value>>();
	});

	it("unwraps stream event data", () => {
		const output = route.streamResponse(type((input: string) => Number(input)));
		const response = route
			.get("/")
			.streamResponse(type<{ value: number }>())
			.response(type<{ message: string }>(), { status: 201 });
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
		const stream = route
			.get("/")
			.response({ "text/event-stream": type<string>() });
		expectTypeOf<InferClientResponse<typeof stream>["body"]>().toEqualTypeOf<
			AsyncIterable<SseEvent<string>>
		>();
		type Wide = {
			readonly "~restrpc": {
				method: "GET";
				path: "/";
				responses: {
					[status: number]: {
						content: { "application/json": StandardSchemaV1<string> };
					};
				};
			};
		};
		expectTypeOf<InferClientResponse<Wide>["status"]>().toEqualTypeOf<number>();
	});
});
