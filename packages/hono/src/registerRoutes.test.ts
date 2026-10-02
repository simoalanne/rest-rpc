import { Hono } from "hono";
import { registerRoutes } from "./registerRoutes.ts";

describe("registerRoutes configuration", () => {
	it.each([
		0,
		-1,
		1.5,
		Number.NaN,
		Number.POSITIVE_INFINITY,
		Number.MAX_SAFE_INTEGER + 1,
	])(
		"rejects invalid requestBodyLimit %s during registration",
		(requestBodyLimit) => {
			expect(() =>
				registerRoutes(new Hono(), {}, { requestBodyLimit }),
			).toThrow("requestBodyLimit must be a positive safe integer");
		},
	);
});
