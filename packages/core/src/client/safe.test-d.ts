import type { ClientRouteError } from "../contract/response.ts";
import { route } from "../contract/routeBuilder.ts";
import { isDefinedError, RouteError } from "../contract/routeError.ts";
import { type } from "../standard-schema/type.ts";
import { createClient } from "./createClient.ts";
import { safe } from "./safe.ts";

describe("safe types", () => {
	it("reads the error type of client calls and narrows the data", async () => {
		const definition = route
			.get("/")
			.response(type<string>())
			.error("GONE", { status: 410 });
		const client = createClient(definition, { baseUrl: "" });
		const result = await safe(client());
		if (result.error) {
			expectTypeOf(result.error).toEqualTypeOf<
				ClientRouteError<(typeof definition)["~restrpc"]> | Error
			>();
			expectTypeOf(result.data).toEqualTypeOf<undefined>();
		} else {
			expectTypeOf(result.data.body).toEqualTypeOf<string>();
		}
		const { error, data } = await safe(client());
		if (!error) {
			expectTypeOf(data.body).toEqualTypeOf<string>();
		}
	});

	it("narrows client errors to the route's errors with isDefinedError", async () => {
		const definition = route
			.get("/")
			.error("GONE", { status: 410, data: type<{ id: string }>() });
		const client = createClient(definition, { baseUrl: "" });
		const { error } = await safe(client());
		if (isDefinedError(error)) {
			expectTypeOf(error).toEqualTypeOf<
				ClientRouteError<(typeof definition)["~restrpc"]>
			>();
			if (error.code === "GONE") {
				expectTypeOf(error.data).toEqualTypeOf<{ id: string }>();
			}
		}
		try {
			await client();
		} catch (caught) {
			if (isDefinedError(caught)) {
				expectTypeOf(caught).toEqualTypeOf<RouteError>();
			}
		}
	});
});
