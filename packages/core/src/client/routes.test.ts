import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { noBody } from "../contract/response.ts";
import {
	getSuccessfulResponseStatuses,
	hasSingleSuccessfulResponse,
	isApiClientRouteNode,
	isHttpRouteNode,
	isSuccessStatus,
	isWebSocketRouteNode,
} from "./routes.ts";

const httpRoute = {
	method: "GET",
	path: "/todos/:id",
	responses: {
		200: noBody(),
		201: noBody(),
		404: noBody(),
	},
} as const;

const websocketRoute = {
	method: "GET",
	path: "/rooms/:roomId",
	mode: "webSocket",
	messages: {
		client: noBody(),
		server: noBody(),
	},
} as const;

describe("client route helpers", () => {
	it("identifies client route leaves", () => {
		assert.equal(
			isApiClientRouteNode({ fetchResponse: () => undefined }),
			true,
		);
		assert.equal(
			isApiClientRouteNode({ openConnection: () => undefined }),
			true,
		);
		assert.equal(isApiClientRouteNode({ nested: {} }), false);
		assert.equal(isApiClientRouteNode(null), false);
	});

	it("identifies HTTP and websocket route declarations", () => {
		assert.equal(isHttpRouteNode(httpRoute), true);
		assert.equal(isWebSocketRouteNode(httpRoute), false);
		assert.equal(isHttpRouteNode(websocketRoute), false);
		assert.equal(isWebSocketRouteNode(websocketRoute), true);
	});

	it("detects success statuses and successful response counts", () => {
		assert.equal(isSuccessStatus(199), false);
		assert.equal(isSuccessStatus(200), true);
		assert.equal(isSuccessStatus(299), true);
		assert.equal(isSuccessStatus(300), false);
		assert.deepEqual(getSuccessfulResponseStatuses(httpRoute), [200, 201]);
		assert.deepEqual(getSuccessfulResponseStatuses(websocketRoute), []);
		assert.equal(hasSingleSuccessfulResponse(httpRoute), false);
		assert.equal(
			hasSingleSuccessfulResponse({
				method: "DELETE",
				path: "/todos/:id",
				responses: {
					204: noBody(),
					404: noBody(),
				},
			}),
			true,
		);
	});
});
