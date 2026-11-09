import { route } from "../contract/routeBuilder.ts";
import { type } from "../standard-schema/type.ts";
import { createClient } from "./createClient.ts";

describe("createClient", () => {
	it("mirrors nested contracts and resolves implicit paths", async () => {
		const fetch = vi.fn(async () => Response.json("Ada"));
		const contract = {
			users: {
				find: route.body(type<{ id: number }>()).response(type<string>()),
			},
		};
		const client = createClient(contract, {
			baseUrl: "https://example.test",
			fetch,
		});
		expect(await client.users.find({ body: { id: 1 } })).toMatchObject({
			status: 200,
			body: "Ada",
		});
		expect(fetch).toHaveBeenCalledWith(
			"https://example.test/users/find",
			expect.objectContaining({ method: "POST", body: '{"id":1}' }),
		);
	});

	it("maps response bodies only when validation is enabled", async () => {
		const contract = route.response(type((value: string) => value.length));
		const options = { baseUrl: "", fetch: async () => Response.json("Ada") };
		expect((await createClient(contract, options)()).body).toBe("Ada");
		expect(
			(await createClient(contract, { ...options, validateResponses: true })())
				.body,
		).toBe(3);
	});

	it("rejects a response media type outside the definition even without validation", async () => {
		const client = createClient(route.response(type<string>()), {
			baseUrl: "",
			fetch: async () =>
				new Response("Ada", { headers: { "content-type": "text/plain" } }),
		});
		await expect(client()).rejects.toThrow(
			new Error("Response did not match the route contract."),
		);
	});
});
