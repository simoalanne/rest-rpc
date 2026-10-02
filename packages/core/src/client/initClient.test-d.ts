import { route } from "../contract/routeBuilder.ts";
import { type } from "../standard-schema/type.ts";
import { initClient } from "./initClient.ts";

describe("initClient types", () => {
	it("allows empty requests and optional or guaranteed segmented headers", () => {
		const empty = initClient(route.get("/").response(204), { baseUrl: "" });
		empty();
		empty(undefined, {});
		const contract = route
			.get("/")
			.headers(type<{ token: string; optional?: string }>())
			.response(204);
		const literal = initClient(contract, {
			baseUrl: "",
			globalHeaders: { token: "value" },
		});
		const asyncProvider = initClient(contract, {
			baseUrl: "",
			globalHeaders: { token: async () => "value" },
		});
		const optionalProvider = initClient(contract, {
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
		const optional = initClient(
			route.get("/").headers(type<{ token?: string }>()).response(204),
			{ baseUrl: "" },
		);
		optional({});
	});

	it("uses schema inputs for arguments and schema outputs for results", () => {
		const contract = {
			length: route
				.input(type((value: string) => Number(value)))
				.output(type((value: string) => value.length)),
		};
		const client = initClient(contract, { baseUrl: "" });
		expectTypeOf(client.length).parameter(0).toEqualTypeOf<string>();
		expectTypeOf(client.length).returns.resolves.toEqualTypeOf<number>();
		// @ts-expect-error Requests use the schema input, not its transformed output.
		client.length(1);
	});

	it("narrows response envelopes by their declared status", async () => {
		const client = initClient(
			route
				.get()
				.response(200, type<{ name: string }>())
				.response(404, type<{ message: string }>()),
			{ baseUrl: "" },
		);
		const response = await client();
		if (response.status === 200)
			expectTypeOf(response.body).toEqualTypeOf<{ name: string }>();
		else expectTypeOf(response.body).toEqualTypeOf<{ message: string }>();
	});

	it("requires a supported media type when the request declares several", () => {
		const client = initClient(
			route
				.body(type<string>(), {
					contentType: ["text/plain", "application/json"],
				})
				.output(type<string>()),
			{ baseUrl: "" },
		);
		client({ body: "Ada" }, { contentType: "text/plain" });
		// @ts-expect-error Multi-format requests require a selection.
		client({ body: "Ada" });
		// @ts-expect-error A selection must be a declared format.
		client({ body: "Ada" }, { contentType: "image/png" });
	});

	it("requires guaranteed global header values for flat inputs", () => {
		const contract = route
			.headers(type<{ authorization: string }>())
			.input(type<string>())
			.output(type<string>());
		const client = initClient(contract, {
			baseUrl: "",
			globalHeaders: { authorization: async () => "token" },
		});
		client("Ada");
		const missing = initClient(contract, {
			baseUrl: "",
			globalHeaders: { authorization: (): string | undefined => undefined },
		});
		// @ts-expect-error An optional provider cannot satisfy a required flat-input header.
		missing("Ada");
	});
});
