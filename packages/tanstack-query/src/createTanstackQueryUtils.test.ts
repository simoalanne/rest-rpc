import { route, routeError, type } from "@rest-rpc/core";
import { QueryClient } from "@tanstack/query-core";
import { createTanstackQueryUtils } from "./createTanstackQueryUtils.ts";

const UserNotFound = routeError("USER_NOT_FOUND", { status: 404 });
const contract = {
	users: {
		get: route
			.get("/users")
			.response(type<{ name: string }>())
			.error(UserNotFound),
	},
};

describe("createTanstackQueryUtils", () => {
	it("mirrors the contract tree and returns successful response envelopes", async () => {
		const utils = createTanstackQueryUtils(contract, {
			baseUrl: "https://example.test",
			fetch: async () => Response.json({ name: "Ada" }),
		});
		const client = new QueryClient();
		expect(utils.users.get.queryKey()).toEqual(["users", "get"]);
		expect(
			await client.fetchQuery(utils.users.get.queryOptions()),
		).toMatchObject({ status: 200, body: { name: "Ada" } });
		client.clear();
	});

	it("rejects with the client's errors", async () => {
		const utils = createTanstackQueryUtils(contract, {
			baseUrl: "https://example.test",
			fetch: async () =>
				Response.json(
					{ code: "USER_NOT_FOUND", message: "Missing" },
					{ status: 404 },
				),
		});
		const client = new QueryClient();
		await expect(
			client.fetchQuery(utils.users.get.queryOptions({ retry: false })),
		).rejects.toMatchObject({ code: "USER_NOT_FOUND", status: 404 });
		client.clear();
	});
});
