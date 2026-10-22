import type { ClientRouteError } from "../contract/response.ts";
import { route } from "../contract/routeBuilder.ts";
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

	it("types errors of other promises as unknown", async () => {
		const [error] = await safe(Promise.resolve(1));
		expectTypeOf(error).toEqualTypeOf<unknown>();
	});
});
