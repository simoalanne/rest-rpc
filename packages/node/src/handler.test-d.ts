import type { IncomingMessage, ServerResponse } from "node:http";
import { createRouteHandler } from "./handler.ts";
import type { NodeRouteHandlerResult } from "./index.ts";

describe("handler types", () => {
	it("accepts native Node request/response arguments and returns dispatch status", () => {
		const handler = createRouteHandler({});
		expectTypeOf(handler).parameters.toEqualTypeOf<
			[IncomingMessage, ServerResponse]
		>();
		expectTypeOf(
			handler,
		).returns.resolves.toEqualTypeOf<NodeRouteHandlerResult>();
	});

	it("rejects a Fetch Request and a relative prefix", () => {
		const response = {} as ServerResponse;
		// @ts-expect-error Node handlers require native Node HTTP arguments
		createRouteHandler({})(new Request("http://localhost/"), response);
		// @ts-expect-error route prefixes must be absolute
		createRouteHandler({}, { prefix: "api" });
	});
});
