import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { router } from "../contract/define.ts";
import { noBody } from "../contract/route.ts";
import { type } from "../standard-schema/type.ts";
import { getRouteCacheTags } from "./cacheTags.ts";

describe("route cache tags", () => {
	it("generates exact and queryless tags from the serialized route request", () => {
		const apiContract = router({
			items: {
				list: {
					method: "GET",
					path: "/items/:id",
					request: {
						params: { id: type<string>() },
						query: {
							filter: type<string>(),
							page: type<number>(),
						},
						requestKeys: {
							id: "params",
							filter: "query",
							page: "query",
						},
					},
					responses: {
						204: noBody(),
					},
				},
			},
		});

		assert.deepEqual(
			getRouteCacheTags(apiContract.items.list, {
				request: {
					id: "one/two",
					filter: "open",
					page: 2,
				},
			}),
			[
				"rest-rpc:/items/one%2Ftwo?filter=open&page=2",
				"rest-rpc:/items/one%2Ftwo",
			],
		);
	});

	it("uses a custom prefix and de-dupes routes without query params", () => {
		const apiContract = router({
			items: {
				get: {
					method: "GET",
					path: "/items/:id",
					request: {
						params: { id: type<string>() },
						requestKeys: {
							id: "params",
						},
					},
					responses: {
						204: noBody(),
					},
				},
			},
		});

		assert.deepEqual(
			getRouteCacheTags(apiContract.items.get, {
				request: { id: "one" },
				prefix: "api",
			}),
			["api:/items/one"],
		);
	});
});
