import { type } from "../standard-schema/type.ts";
import { RouteError, routeError } from "./routeError.ts";

describe("routeError types", () => {
	it("requires data and headers inputs only when their schemas are defined", () => {
		const Plain = routeError("PLAIN");
		new Plain();
		// @ts-expect-error Errors without a data schema take no data.
		new Plain({ data: { id: "1" } });

		const WithData = routeError("WITH_DATA", {
			data: type((input: { id: number }) => String(input.id)),
		});
		new WithData({ data: { id: 1 } });
		// @ts-expect-error The data input is required.
		new WithData();
		// @ts-expect-error The data input is required.
		new WithData({ message: "Missing" });

		const WithHeaders = routeError("WITH_HEADERS", {
			status: 429,
			headers: type<{ "retry-after": number }>(),
		});
		new WithHeaders({ headers: { "retry-after": 1 } });
		// @ts-expect-error Defined headers are required.
		new WithHeaders();
	});

	it("types instances by code, status, data input and headers input", () => {
		const Limited = routeError("LIMITED", {
			status: 429,
			data: type<{ retry: number }>(),
			headers: type<{ "retry-after": number }>(),
		});
		expectTypeOf(
			new Limited({ data: { retry: 1 }, headers: { "retry-after": 1 } }),
		).toEqualTypeOf<
			RouteError<"LIMITED", { retry: number }, 429, { "retry-after": number }>
		>();
		expectTypeOf(new (routeError("PLAIN"))()).toEqualTypeOf<
			RouteError<"PLAIN", undefined, 400, Record<string, unknown>>
		>();
	});
});
