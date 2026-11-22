import { createClient } from "../client/createClient.ts";
import { type } from "../standard-schema/type.ts";
import { contractFromJson, extractContract } from "./extract.ts";
import { route } from "./routeBuilder.ts";

const user = type<{ name: string }>();

const routes = {
	users: {
		get: route
			.$meta<{ auth: "required" }>()
			.get("/users/:id")
			.params(type<{ id: string }>())
			.meta({ auth: "required" })
			.response(user)
			.error("USER_NOT_FOUND", { status: 404, data: type<{ id: string }>() }),
		create: route
			.body(user)
			.openAPI({ summary: "Create user" })
			.response(user, { status: 201 }),
	},
};

describe("extractContract", () => {
	it("keeps only methods, resolved paths, request bodies, response statuses and bodies, and error statuses", () => {
		expect(extractContract(routes)).toEqual({
			users: {
				get: {
					"~restrpc": {
						method: "GET",
						path: "/users/:id",
						responses: { 200: { body: null } },
						errors: { USER_NOT_FOUND: { status: 404 } },
					},
				},
				create: {
					"~restrpc": {
						method: "POST",
						path: "/users/create",
						request: { body: [] },
						responses: { 201: { body: null } },
					},
				},
			},
		});
		expect(
			extractContract({ remove: route.delete("/").response({ status: 204 }) }),
		).toEqual({
			remove: {
				"~restrpc": { method: "DELETE", path: "/", responses: { 204: {} } },
			},
		});
	});

	it("leaves out handlers and survives JSON serialization", () => {
		const withHandler = {
			"~restrpc": { ...route.get("/health")["~restrpc"], handler: () => "ok" },
		};
		const contract = extractContract({ health: withHandler });
		expect(contractFromJson(JSON.parse(JSON.stringify(contract)))).toEqual({
			health: {
				"~restrpc": { method: "GET", path: "/health", responses: {} },
			},
		});
		for (const json of [
			null,
			[],
			{ health: "/health" },
			{ health: { "~restrpc": {} } },
		]) {
			expect(() => contractFromJson(json)).toThrow(TypeError);
		}
	});

	it("creates a client that recognizes defined error codes", async () => {
		const fetch = vi.fn(async (_request: Request) =>
			Response.json(
				{ code: "USER_NOT_FOUND", message: "Missing", data: { id: "1" } },
				{ status: 404 },
			),
		);
		const json = JSON.parse(JSON.stringify(extractContract(routes)));
		const client = createClient(contractFromJson<typeof routes>(json), {
			origin: "https://example.test",
			fetch,
		});
		await expect(
			client.users.get({ params: { id: "1" } }),
		).rejects.toMatchObject({
			code: "USER_NOT_FOUND",
			status: 404,
			data: { id: "1" },
		});
		expect(fetch.mock.calls[0]![0]).toMatchObject({
			method: "GET",
			url: "https://example.test/users/1",
		});
	});

	it("creates a client that checks response statuses without schemas", async () => {
		const respond = vi.fn(async () => Response.json({ name: 1 }));
		const client = createClient(extractContract(routes), {
			origin: "https://example.test",
			fetch: respond,
			validateResponses: true,
		});
		await expect(
			client.users.get({ params: { id: "1" } }),
		).resolves.toMatchObject({ status: 200, body: { name: 1 } });

		respond.mockImplementation(async () =>
			Response.json({ name: "Ada" }, { status: 202 }),
		);
		await expect(client.users.get({ params: { id: "1" } })).rejects.toThrow();
	});

	it("resolves prefixed tree-derived paths", () => {
		const api = route.prefix("/api");
		expect(
			extractContract({ posts: { list: api.get() } }).posts.list["~restrpc"],
		).toEqual({ method: "GET", path: "/api/posts/list", responses: {} });
	});
});
