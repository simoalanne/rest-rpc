import { compileRoutes, createCatchAllHandler } from "./handler.ts";

describe("handler types", () => {
	it("narrows the response using the matched discriminant", async () => {
		const handler = createCatchAllHandler(compileRoutes({}));
		expectTypeOf(handler).parameter(0).toEqualTypeOf<Request>();
		const result = await handler(new Request("http://localhost/"));
		if (result.matched) {
			expectTypeOf(result.response).toEqualTypeOf<Response>();
		} else {
			expectTypeOf(result.response).toEqualTypeOf<undefined>();
		}
	});

	it("requires an absolute prefix and a Fetch response from validation handlers", () => {
		// @ts-expect-error prefixes must be absolute paths
		createCatchAllHandler(compileRoutes({}, { prefix: "api" }));
		createCatchAllHandler(
			compileRoutes(
				{},
				// @ts-expect-error validation handlers must return a Response
				{ requestValidationErrorHandler: () => ({ status: 400 }) },
			),
		);
	});
});
