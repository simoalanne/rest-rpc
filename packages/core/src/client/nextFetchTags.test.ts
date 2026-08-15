import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { router } from "../contract/contract.ts";
import { noBody } from "../contract/response.ts";
import { type } from "../standard-schema/type.ts";
import { getNextFetchTags } from "./nextFetchTags.ts";

describe("Next fetch tags", () => {
	it("generates exact and route-level tags from the route cache key and request", () => {
		const apiContract = router({
			items: {
				list: {
					method: "GET",
					path: "/items/:id",
					body: {
						ignoredBody: type<string>(),
					},
					headers: {
						authorization: type<string>(),
					},
					pathParams: { id: type<string>() },
					query: {
						filter: type<string>(),
						page: type<number>(),
					},
					requestKeys: {
						id: "pathParams",
						filter: "query",
						page: "query",
						authorization: "headers",
						ignoredBody: "body",
					},
					responses: {
						204: noBody(),
					},
				},
			},
		});

		assert.deepEqual(
			getNextFetchTags(apiContract.items.list, {
				id: "one/two",
				filter: "open",
				page: 2,
				authorization: "Bearer secret",
				ignoredBody: "ignored",
			}),
			[
				"rest-rpc:items.list:filter:open:id:one%2Ftwo:page:2",
				"rest-rpc:items.list",
			],
		);
		assert.deepEqual(getNextFetchTags(apiContract.items.list), [
			"rest-rpc:items.list",
		]);
	});

	it("uses a custom prefix and de-dupes routes without query params", () => {
		const apiContract = router({
			items: {
				get: {
					method: "GET",
					path: "/items/:id",
					pathParams: { id: type<string>() },
					requestKeys: {
						id: "pathParams",
					},
					responses: {
						204: noBody(),
					},
				},
			},
		});

		assert.deepEqual(
			getNextFetchTags(
				apiContract.items.get,
				{ id: "one" },
				{ tagPrefix: "api" },
			),
			["api:items.get:id:one", "api:items.get"],
		);
	});
});
