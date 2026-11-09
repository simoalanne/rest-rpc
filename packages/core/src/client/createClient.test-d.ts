import { route } from "../contract/routeBuilder.ts";
import { type } from "../standard-schema/type.ts";
import { createClient } from "./createClient.ts";

describe("createClient types", () => {
	it("allows empty requests and optional or guaranteed segmented headers", () => {
		const empty = createClient(route.get("/").response({ status: 204 }), {
			baseUrl: "",
		});
		empty();
		empty(undefined, {});
		const contract = route
			.get("/")
			.headers(type<{ token: string; optional?: string }>())
			.response({ status: 204 });
		const literal = createClient(contract, {
			baseUrl: "",
			globalHeaders: { token: "value" },
		});
		const asyncProvider = createClient(contract, {
			baseUrl: "",
			globalHeaders: { token: async () => "value" },
		});
		const optionalProvider = createClient(contract, {
			baseUrl: "",
			globalHeaders: { token: (): string | undefined => undefined },
		});
		expectTypeOf(literal).parameter(0).toEqualTypeOf<{
			headers?: { token?: string; optional?: string };
		}>();
		expectTypeOf(asyncProvider)
			.parameter(0)
			.toEqualTypeOf<Parameters<typeof literal>[0]>();
		literal({});
		asyncProvider({ headers: { optional: "value" } });
		optionalProvider({ headers: { token: "value" } });
		// @ts-expect-error An optional provider cannot guarantee the required token.
		optionalProvider({});
		const optional = createClient(
			route
				.get("/")
				.headers(type<{ token?: string }>())
				.response({ status: 204 }),
			{ baseUrl: "" },
		);
		optional({});
	});

	it("uses schema inputs for arguments and schema outputs for results", () => {
		const contract = {
			length: route
				.body(type((value: string) => Number(value)))
				.response(type((value: string) => value.length)),
		};
		const client = createClient(contract, { baseUrl: "" });
		expectTypeOf(client.length).parameter(0).toEqualTypeOf<{
			contentType?: "application/json";
			body: string;
		}>();
		expectTypeOf(client.length).returns.resolves.toEqualTypeOf<{
			status: 200;
			contentType: "application/json";
			body: number;
			headers: Record<string, string>;
		}>();
		// @ts-expect-error Requests use the schema input, not its transformed output.
		client.length({ body: 1 });
	});

	it("narrows response envelopes by their defined status", async () => {
		const client = createClient(
			route
				.get()
				.response(type<{ name: string }>())
				.response(type<{ id: string }>(), { status: 201 }),
			{ baseUrl: "" },
		);
		const response = await client();
		if (response.status === 200)
			expectTypeOf(response.body).toEqualTypeOf<{ name: string }>();
		else expectTypeOf(response.body).toEqualTypeOf<{ id: string }>();
	});
});
