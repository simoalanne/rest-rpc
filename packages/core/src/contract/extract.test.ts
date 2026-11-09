import { initClient } from "../client/initClient.ts";
import { type } from "../standard-schema/type.ts";
import { extractContract } from "./extract.ts";
import { route } from "./routeBuilder.ts";

const user = type<{ name: string }>();

const routes = {
	users: {
		get: route
			.get("/users/:id")
			.params(type<{ id: string }>())
			.meta({ auth: "required" })
			.response(user)
			.error("USER_NOT_FOUND", { status: 404, data: type<{ id: string }>() }),
		create: route
			.body({ "application/json": user, "text/plain": type<string>() })
			.openAPI({ summary: "Create user" })
			.response(user, { status: 201 }),
	},
};

describe("extractContract", () => {
	it("keeps only methods, resolved paths, request body media types, response statuses and media types, and error statuses", () => {
		expect(extractContract(routes)).toEqual({
			users: {
				get: {
					"~restrpc": {
						method: "GET",
						path: "/users/:id",
						responses: { 200: { content: { "application/json": null } } },
						errors: { USER_NOT_FOUND: { status: 404 } },
					},
				},
				create: {
					"~restrpc": {
						method: "POST",
						path: "/users/create",
						request: { body: { "application/json": [], "text/plain": [] } },
						responses: { 201: { content: { "application/json": null } } },
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
		expect(JSON.parse(JSON.stringify(contract))).toEqual({
			health: {
				"~restrpc": { method: "GET", path: "/health", responses: {} },
			},
		});
	});

	it("creates a client that recognizes declared error codes", async () => {
		const fetch = vi.fn(async () =>
			Response.json(
				{ code: "USER_NOT_FOUND", message: "Missing", data: { id: "1" } },
				{ status: 404 },
			),
		);
		const client = initClient(extractContract(routes), {
			baseUrl: "https://example.test",
			fetch,
		});
		await expect(
			client.users.get({ params: { id: "1" } }),
		).rejects.toMatchObject({
			code: "USER_NOT_FOUND",
			status: 404,
			data: { id: "1" },
		});
		expect(fetch).toHaveBeenCalledWith(
			"https://example.test/users/1",
			expect.objectContaining({ method: "GET" }),
		);
	});

	it("creates a client that checks response statuses and media types without schemas", async () => {
		const respond = vi.fn(async () => Response.json({ name: 1 }));
		const client = initClient(extractContract(routes), {
			baseUrl: "https://example.test",
			fetch: respond,
			validateResponses: true,
		});
		await expect(
			client.users.get({ params: { id: "1" } }),
		).resolves.toMatchObject({ status: 200, body: { name: 1 } });

		respond.mockImplementation(async () =>
			Response.json({ name: "Ada" }, { status: 202 }),
		);
		await expect(client.users.get({ params: { id: "1" } })).rejects.toThrow(
			"Response did not match the route contract.",
		);

		respond.mockImplementation(
			async () =>
				new Response("Ada", { headers: { "content-type": "text/plain" } }),
		);
		await expect(client.users.get({ params: { id: "1" } })).rejects.toThrow(
			"Response did not match the route contract.",
		);
	});

	it("resolves prefixed tree-derived paths", () => {
		const api = route.prefix("/api");
		expect(
			extractContract({ todos: { list: api.get() } }).todos.list["~restrpc"],
		).toEqual({ method: "GET", path: "/api/todos/list", responses: {} });
	});
});
