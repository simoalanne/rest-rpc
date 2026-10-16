import type { IncomingMessage, ServerResponse } from "node:http";
import { compileRoutes, createCatchAllHandler } from "./handler.ts";
import type { HandleOptions, NodeRouteHandlerResult } from "./index.ts";

describe("handler types", () => {
	it("accepts native Node request/response arguments and returns dispatch status", () => {
		const handler = createCatchAllHandler(compileRoutes({}));
		expectTypeOf(handler).parameters.toEqualTypeOf<
			[IncomingMessage, ServerResponse, HandleOptions?]
		>();
		expectTypeOf(
			handler,
		).returns.resolves.toEqualTypeOf<NodeRouteHandlerResult>();
	});

	it("rejects a Fetch Request and a relative prefix", () => {
		const response = {} as ServerResponse;
		createCatchAllHandler(compileRoutes({}))(
			// @ts-expect-error Node handlers require native Node HTTP arguments
			new Request("http://localhost/"),
			response,
		);
		// @ts-expect-error route prefixes must be absolute
		createCatchAllHandler(compileRoutes({}, { prefix: "api" }));
	});
});
