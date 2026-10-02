import { route } from "../contract/routeBuilder.ts";
import { type } from "../standard-schema/type.ts";
import { initClient } from "./initClient.ts";

describe("initClient", () => {
	it("mirrors nested contracts and resolves implicit paths for flat inputs and outputs", async () => {
		const fetch = vi.fn(async () => Response.json("Ada"));
		const contract = {
			users: {
				find: route.input(type<{ id: number }>()).output(type<string>()),
			},
		};
		const client = initClient(contract, {
			baseUrl: "https://example.test",
			fetch,
		});
		expect(await client.users.find({ id: 1 })).toBe("Ada");
		expect(fetch).toHaveBeenCalledWith(
			"https://example.test/users/find",
			expect.objectContaining({ method: "POST", body: '{"id":1}' }),
		);
	});

	it("returns declared error envelopes without treating them as transport failures", async () => {
		const client = initClient(
			route.get("/users").response(404, type<{ message: string }>()),
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
		const client = initClient(route.get().response(200, type<string>()), {
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
		const contract = route.output(type((value: string) => value.length));
		const options = { baseUrl: "", fetch: async () => Response.json("Ada") };
		expect(await initClient(contract, options)()).toBe("Ada");
		expect(
			await initClient(contract, { ...options, validateResponses: true })(),
		).toBe(3);
	});

	it("rejects a response media type outside the declaration even without validation", async () => {
		const client = initClient(route.output(type<string>()), {
			baseUrl: "",
			fetch: async () =>
				new Response("Ada", { headers: { "content-type": "text/plain" } }),
		});
		await expect(client()).rejects.toMatchObject({
			name: "HttpError",
			message: "Server returned an unsupported response content-type.",
		});
	});

	it("rejects non-object GET flat inputs before fetching", async () => {
		const fetch = vi.fn();
		const client = initClient(
			route.get().input(type<string>()).output(type<string>()),
			{ baseUrl: "", fetch },
		);
		await expect(client("invalid")).rejects.toThrow(
			"GET flat input must be an object of query values.",
		);
		expect(fetch).not.toHaveBeenCalled();
	});
});
