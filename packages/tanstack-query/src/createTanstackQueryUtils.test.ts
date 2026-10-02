import { route, type } from "@rest-rpc/core";
import { QueryClient } from "@tanstack/query-core";
import { createTanstackQueryUtils } from "./createTanstackQueryUtils.ts";

const contract = {
	users: {
		get: route
			.get("/users")
			.response(200, type<{ name: string }>())
			.response(404, type<{ message: string }>()),
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

	it("rejects non-success envelopes as query errors", async () => {
		const utils = createTanstackQueryUtils(contract, {
			baseUrl: "https://example.test",
			fetch: async () => Response.json({ message: "missing" }, { status: 404 }),
		});
		const client = new QueryClient();
		await expect(
			client.fetchQuery(utils.users.get.queryOptions({ retry: false })),
		).rejects.toMatchObject({ status: 404, body: { message: "missing" } });
		client.clear();
	});

	it("preserves Error failures and wraps non-Error failures with their cause", async () => {
		for (const failure of [new Error("offline"), "offline"]) {
			const utils = createTanstackQueryUtils(contract, {
				baseUrl: "https://example.test",
				fetch: async () => {
					throw failure;
				},
			});
			const client = new QueryClient();
			const result = client.fetchQuery(
				utils.users.get.queryOptions({ retry: false }),
			);
			if (failure instanceof Error) await expect(result).rejects.toBe(failure);
			else
				await expect(result).rejects.toMatchObject({
					message: "API request failed",
					cause: failure,
				});
			client.clear();
		}
	});
});
