import assert from "node:assert/strict";
import { describe, it } from "node:test";
import z from "zod";
import { type } from "../standard-schema/index.ts";
import { route } from "./routeFactory.ts";
import { validateWebSocketMessageSync } from "./websocketRouteBuilder.ts";

describe("WebSocket route builder runtime", () => {
	it("builds routes from both message directions", () => {
		const client = type<{ command: string }>();
		const server = type<{ event: string }>();
		const declaration = route
			.ws("/socket")
			.clientMessage("command", client)
			.serverMessage("event", server);

		assert.deepEqual(declaration.messages, {
			client: { command: client },
			server: { event: server },
		});
	});

	it("accumulates discriminated messages by direction", () => {
		const join = type<{ roomId: string }>();
		const message = type<{ text: string }>();
		const connected = type<{ memberCount: number }>();
		const declaration = route
			.ws("/socket")
			.clientMessage("join", join)
			.clientMessage("message", message)
			.serverMessage("connected", connected);

		assert.deepEqual(declaration.messages, {
			client: { join, message },
			server: { connected },
		});
	});

	it("rejects duplicate message types", () => {
		const client = type<{ command: string }>();
		const server = type<{ event: string }>();

		assert.throws(
			() =>
				route
					.ws("/socket")
					.clientMessage("command", client)
					.clientMessage("command", client),
			/WebSocket client message type "command" is already declared/,
		);
		assert.throws(
			() =>
				route
					.ws("/socket")
					.serverMessage("event", server)
					.serverMessage("event", server),
			/WebSocket server message type "event" is already declared/,
		);
	});

	it("ignores HTTP-only configured defaults", () => {
		const schema = type<string>();
		const declaration = route
			.with({
				pathPrefix: "/api",
				headers: type<{ authorization: string }>(),
				responses: { 401: schema },
				strictStatusCodes: true,
			})
			.ws("/socket")
			.clientMessage("message", schema);

		assert.equal(declaration.path, "/api/socket");
		assert.equal(declaration.request?.headers, undefined);
		assert.equal(Object.hasOwn(declaration, "strictStatusCodes"), false);
	});
});

describe("validateWebSocketMessageSync", () => {
	it("rejects inherited object properties as message discriminators", () => {
		const result = validateWebSocketMessageSync(
			{
				send: z.object({ text: z.string() }),
			},
			{
				type: "constructor",
				message: {},
			},
		);

		assert.deepEqual(result, {
			issues: [{ message: "Unknown WebSocket message discriminator." }],
		});
	});
});
