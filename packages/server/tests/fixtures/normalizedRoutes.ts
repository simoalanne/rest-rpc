import { route as contractRoute, type } from "@rest-rpc/core";
import type { StandardSchemaV1 } from "@rest-rpc/core/standard-schema";
import { serverFirstRoute as route } from "@rest-rpc/server";

export interface InputSchema extends StandardSchemaV1<{ name: string }> {
	customMethod(): string;
}
declare const inputSchema: InputSchema;

export type AppContext = { user: { id: string } } & { count: number };
export type Output = { id: string } & { name: string };
declare const output: Output;

export const getContract = () => ({
	plain: route.handler(() => "Hello, World!"),
	stream: route.handler(async function* () {
		yield output;
	}),
	input: route
		.$context<AppContext>()
		.input(inputSchema)
		.handler(({ input }) => input.name),
	getInput: route
		.input(inputSchema)
		.get("/users")
		.handler(({ input }) => input.name),
	union: route
		.get()
		.handler(() =>
			Math.random() > 0.5
				? { status: 200, body: output }
				: { status: 200, body: "text", contentType: "text/plain" },
		),
	empty: route
		.delete()
		.handler(() => ({ status: 204, responseHeaders: { "x-count": 1 } })),
	http: route.post("/users").handler(() => ({
		status: 201,
		body: output,
		responseHeaders: { "x-count": 1 },
	})),
	declared: route
		.get("/users/{id}")
		.params(type<{ id: string }>())
		.query(type<{ q: string }>())
		.headers(type<{ authorization: string }>())
		.response(200, type<Output>(), { headers: type<{ "x-count": string }>() })
		.response(204)
		.handler(() => ({
			status: 200,
			body: output,
			responseHeaders: { "x-count": "1" },
		})),
	contract: contractRoute
		.body(inputSchema)
		.body(type<{ extra: string }>())
		.response(200, type<Output>(), { headers: type<{ "x-count": string }>() })[
		"~restrpc"
	],
});
