import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { route } from "../contract/routeBuilder.ts";
import { type } from "../standard-schema/type.ts";
import { getNextFetchTags } from "./nextFetchTags.ts";

describe("Next fetch tags", () => {
	it("generates exact and route-level tags from the route path and request", () => {
		const apiContract = {
			items: {
				list: route
					.get("/items/:id")
					.body(type<{ ignoredBody: string }>())
					.headers(type<{ authorization: string }>())
					.params(type<{ id: string }>())
					.query(type<{ filter: string; page: number }>())
					.response(204),
			},
		};

		assert.deepEqual(
			getNextFetchTags(apiContract.items.list, ["items", "list"], {
				params: { id: "one/two" },
				query: { filter: "open", page: 2 },
				headers: { authorization: "Bearer secret" },
				body: { ignoredBody: "ignored" },
			}),
			[
				"rest-rpc:items.list:params:%7B%22id%22%3A%22one%2Ftwo%22%7D:query:%7B%22filter%22%3A%22open%22%2C%22page%22%3A2%7D",
				"rest-rpc:items.list",
			],
		);
		assert.deepEqual(
			getNextFetchTags(apiContract.items.list, ["items", "list"]),
			["rest-rpc:items.list"],
		);
	});

	it("uses a custom prefix and de-dupes routes without query params", () => {
		const apiContract = {
			items: {
				get: route
					.get("/items/:id")
					.params(type<{ id: string }>())
					.response(204),
			},
		};

		assert.deepEqual(
			getNextFetchTags(
				apiContract.items.get,
				["items", "get"],
				{ params: { id: "one" } },
				{ tagPrefix: "api" },
			),
			["api:items.get:params:%7B%22id%22%3A%22one%22%7D", "api:items.get"],
		);
	});

	it("uses a method and path as an explicit route identity", () => {
		const apiContract = {
			items: route
				.get("/items/:id")
				.params(type<{ id: string }>())
				.response(204),
		};

		assert.deepEqual(
			getNextFetchTags(
				apiContract.items,
				{ method: "GET", path: "/items/:id" },
				{ params: { id: "one" } },
			),
			[
				"rest-rpc:get:/items/:id:params:%7B%22id%22%3A%22one%22%7D",
				"rest-rpc:get:/items/:id",
			],
		);
	});

	it("omits undefined fields within request segments", () => {
		const groupedRoute = route;
		const apiContract = {
			items: {
				list: groupedRoute
					.get("/items/:id")
					.params(type<{ id: string }>())
					.query(type<{ filter: string }>())
					.response(204),
			},
		};

		assert.deepEqual(
			getNextFetchTags(apiContract.items.list, ["items", "list"], {
				params: { id: "one", unused: undefined },
				query: { filter: "open" },
			}),
			[
				"rest-rpc:items.list:params:%7B%22id%22%3A%22one%22%7D:query:%7B%22filter%22%3A%22open%22%7D",
				"rest-rpc:items.list",
			],
		);
	});

	it("serializes JSON query values in grouped request segments", () => {
		const groupedRoute = route;
		const apiContract = {
			items: {
				list: groupedRoute
					.get("/items")
					.jsonQuery(type<{ page: number; filters: { tag: string } }>())
					.response(204),
			},
		};

		assert.deepEqual(
			getNextFetchTags(apiContract.items.list, ["items", "list"], {
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
