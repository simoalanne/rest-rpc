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
			.metadata({ auth: "required" })
			.response(user)
			.error("USER_NOT_FOUND", { status: 404, data: type<{ id: string }>() }),
		create: route
			.body({ "application/json": user, "text/plain": type<string>() })
			.openAPI({ summary: "Create user" })
			.response(user, { status: 201 }),
	},
};

describe("extractContract", () => {
	it("keeps only methods, resolved paths, request body media types, and error statuses", () => {
		expect(extractContract(routes)).toEqual({
			users: {
				get: {
					"~restrpc": {
						method: "GET",
						path: "/users/:id",
						errors: { USER_NOT_FOUND: { status: 404 } },
					},
				},
				create: {
					"~restrpc": {
						method: "POST",
						path: "/users/create",
						request: { body: { "application/json": [], "text/plain": [] } },
					},
				},
			},
		});
	});

	it("leaves out handlers and survives JSON serialization", () => {
		const withHandler = {
			"~restrpc": { ...route.get("/health")["~restrpc"], handler: () => "ok" },
		};
		const contract = extractContract({ health: withHandler });
		expect(JSON.parse(JSON.stringify(contract))).toEqual({
			health: { "~restrpc": { method: "GET", path: "/health" } },
		});
	});

	it("creates a client that returns every status as an envelope", async () => {
		const fetch = vi.fn(async () =>
			Response.json(
				{ message: "unavailable" },
				{ status: 503, headers: { "x-trace": "abc" } },
			),
		);
		const client = initClient(extractContract(routes), {
			baseUrl: "https://example.test",
			fetch,
		});
		await expect(
			client.users.get({ params: { id: "1" } }),
		).resolves.toMatchObject({
			status: 503,
			body: { message: "unavailable" },
			headers: { "x-trace": "abc" },
		});
		expect(fetch).toHaveBeenCalledWith(
			"https://example.test/users/1",
			expect.objectContaining({ method: "GET" }),
		);
	});

	it("resolves prefixed tree-derived paths", () => {
		const api = route.prefix("/api");
		expect(
			extractContract({ todos: { list: api.get() } }).todos.list["~restrpc"],
		).toEqual({ method: "GET", path: "/api/todos/list" });
	});
});
