import { route } from "../contract/routeBuilder.ts";
import { type } from "../standard-schema/type.ts";
import { initClient } from "./initClient.ts";

describe("initClient", () => {
	it("mirrors nested contracts and resolves implicit paths", async () => {
		const fetch = vi.fn(async () => Response.json("Ada"));
		const contract = {
			users: {
				find: route.body(type<{ id: number }>()).response(type<string>()),
			},
		};
		const client = initClient(contract, {
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

	it("returns declared error envelopes without treating them as transport failures", async () => {
		const client = initClient(
			route.get("/users").response(type<{ message: string }>(), { status: 404 }),
			{
				baseUrl: "",
				fetch: async () =>
					Response.json({ message: "missing" }, { status: 404 }),
			},
		);
		expect(await client()).toMatchObject({
			status: 404,
			body: { message: "missing" },
		});
	});

	it("rejects undeclared statuses with the decoded response body", async () => {
		const client = initClient(route.get().response(type<string>()), {
			baseUrl: "",
			fetch: async () => Response.json({ message: "missing" }, { status: 404 }),
		});
		await expect(client()).rejects.toMatchObject({
			name: "HttpError",
			status: 404,
			body: { message: "missing" },
		});
	});

	it("maps response bodies only when validation is enabled", async () => {
		const contract = route.response(type((value: string) => value.length));
		const options = { baseUrl: "", fetch: async () => Response.json("Ada") };
		expect((await initClient(contract, options)()).body).toBe("Ada");
		expect(
			(await initClient(contract, { ...options, validateResponses: true })())
				.body,
		).toBe(3);
	});

	it("rejects a response media type outside the declaration even without validation", async () => {
		const client = initClient(route.response(type<string>()), {
			baseUrl: "",
			fetch: async () =>
				new Response("Ada", { headers: { "content-type": "text/plain" } }),
		});
		await expect(client()).rejects.toMatchObject({
			name: "HttpError",
			message: "Server returned an unsupported response content-type.",
		});
	});
});
