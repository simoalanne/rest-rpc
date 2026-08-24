import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { router } from "../contract/contract.ts";
import { jsonQuery } from "../contract/request.ts";
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

	it("uses grouped request segments when flattened request keys are disabled", () => {
		const apiContract = router(
			{
				items: {
					list: {
						method: "GET",
						path: "/items/:id",
						pathParams: { id: type<string>() },
						query: { filter: type<string>() },
						responses: {
							204: noBody(),
						},
					},
				},
			},
			{
				flattenRequestKeys: false,
			},
		);

		assert.deepEqual(
			getNextFetchTags(apiContract.items.list, {
				pathParams: { id: "one", unused: undefined },
				query: { filter: "open" },
			}),
			[
				"rest-rpc:items.list:pathParams:%7B%22id%22%3A%22one%22%7D:query:%7B%22filter%22%3A%22open%22%7D",
				"rest-rpc:items.list",
			],
		);
	});

	it("serializes JSON query values in grouped request segments", () => {
		const apiContract = router(
			{
				items: {
					list: {
						method: "GET",
						path: "/items",
						query: jsonQuery(
							type<{ page: number; filters: { tag: string } }>(),
						),
						responses: {
							204: noBody(),
						},
					},
				},
			},
			{
				flattenRequestKeys: false,
			},
		);

		assert.deepEqual(
			getNextFetchTags(apiContract.items.list, {
				query: {
					page: 2,
					filters: { tag: "open" },
				},
			}),
			[
				"rest-rpc:items.list:query:%7B%22filters%22%3A%7B%22tag%22%3A%22open%22%7D%2C%22page%22%3A2%7D",
				"rest-rpc:items.list",
			],
		);
	});
});
