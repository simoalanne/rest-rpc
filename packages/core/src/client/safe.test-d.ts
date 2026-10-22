import type { ClientRouteError } from "../contract/response.ts";
import { route } from "../contract/routeBuilder.ts";
import { isRouteError, RouteError } from "../contract/routeError.ts";
import { type } from "../standard-schema/type.ts";
import { initClient } from "./initClient.ts";
import { safe } from "./safe.ts";

describe("safe types", () => {
	it("reads the error type of client calls and narrows the data", async () => {
		const declaration = route
			.get("/")
			.response(type<string>())
			.error("GONE", { status: 410 });
		const client = initClient(declaration, { baseUrl: "" });
		const [error, response] = await safe(client());
		if (error) {
			expectTypeOf(error).toEqualTypeOf<
				ClientRouteError<(typeof declaration)["~restrpc"]> | Error
			>();
		} else {
			expectTypeOf(response.body).toEqualTypeOf<string>();
		}
	});

	it("narrows client errors to the route's errors with isRouteError", async () => {
		const declaration = route
			.get("/")
			.error("GONE", { status: 410, data: type<{ id: string }>() });
		const client = initClient(declaration, { baseUrl: "" });
		const [error] = await safe(client());
		if (isRouteError(error)) {
			expectTypeOf(error).toEqualTypeOf<
				ClientRouteError<(typeof declaration)["~restrpc"]>
			>();
			if (error.code === "GONE") {
				expectTypeOf(error.data).toEqualTypeOf<{ id: string }>();
			}
		}
		try {
			await client();
		} catch (caught) {
			if (isRouteError(caught)) {
				expectTypeOf(caught).toEqualTypeOf<RouteError>();
			}
		}
	});

	it("types errors of other promises as unknown", async () => {
		const [error] = await safe(Promise.resolve(1));
		expectTypeOf(error).toEqualTypeOf<unknown>();
	});
});
