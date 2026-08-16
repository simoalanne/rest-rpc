import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { clearCookie, setCookie } from "./cookies.ts";

describe("cookies", () => {
	describe("setCookie", () => {
		it("serializes cookie name, encoded value, and common attributes", () => {
			assert.equal(
				setCookie("session", "value with spaces", {
					httpOnly: true,
					secure: true,
					sameSite: "lax",
					path: "/",
				}),
				"session=value%20with%20spaces; Path=/; HttpOnly; Secure; SameSite=Lax",
			);
		});

		it("serializes optional attributes", () => {
			assert.equal(
				setCookie("session", "abc", {
					domain: "example.com",
					expires: new Date("2030-01-01T00:00:00.000Z"),
					maxAge: 3600.9,
					partitioned: true,
					path: "/account",
					priority: "high",
					sameSite: "none",
					secure: true,
				}),
				"session=abc; Max-Age=3600; Domain=example.com; Path=/account; Expires=Tue, 01 Jan 2030 00:00:00 GMT; Secure; Partitioned; Priority=High; SameSite=None",
			);
		});

		it("supports custom value encoding", () => {
			assert.equal(
				setCookie("token", "a/b", { encode: (value) => value }),
				"token=a/b",
			);
		});
	});

	describe("clearCookie", () => {
		it("serializes a deletion cookie with matching scope options", () => {
			assert.equal(
				clearCookie("session", {
					httpOnly: true,
					path: "/",
					sameSite: "lax",
				}),
				"session=; Max-Age=0; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; SameSite=Lax",
			);
		});
	});
});
