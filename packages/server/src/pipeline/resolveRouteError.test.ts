import { RouteError, routeError, type } from "@rest-rpc/core";
import type { StandardSchemaV1 } from "@rest-rpc/core/standard-schema";
import { route } from "../builder/routeBuilder.ts";
import { RequestValidationFailed } from "./errors.ts";
import { resolveRouteError } from "./resolveRouteError.ts";

const UserNotFound = routeError("USER_NOT_FOUND", {
	status: 404,
	data: type((id: number) => ({ id: String(id) })),
	headers: type((input: { "x-id": number }) => ({
		"x-id": `${input["x-id"]}`,
	})),
});
const definition = route.get("/users/:id").error(UserNotFound)["~restrpc"];

describe("resolveRouteError", () => {
	it("sends the definition's status and validated data and headers, observing the thrown error", async () => {
		const thrown = new RouteError("USER_NOT_FOUND", {
			message: "Missing",
			data: 1,
			headers: { "x-id": 1 },
		});
		const resolved = await resolveRouteError(definition, thrown, false);
		expect(resolved.error).toBe(thrown);
		expect(resolved.response).toMatchObject({
			code: "USER_NOT_FOUND",
			status: 404,
			message: "Missing",
			data: { id: "1" },
			headers: { "x-id": "1" },
		});
		expect(
			(await resolveRouteError(definition, thrown, true)).response,
		).toMatchObject({ status: 404, data: 1, headers: { "x-id": 1 } });
	});

	it("turns invalid data into a response validation failure", async () => {
		const issues = [{ message: "invalid" }];
		const invalid: StandardSchemaV1 = {
			"~standard": { version: 1, vendor: "test", validate: () => ({ issues }) },
		};
		const Invalid = routeError("INVALID", { data: invalid });
		const { error, response } = await resolveRouteError(
			route.error(Invalid)["~restrpc"],
			new Invalid({ data: "value" }),
			false,
		);
		expect(error).toMatchObject({
			code: "INTERNAL_SERVER_ERROR",
			status: 500,
			cause: { location: "data", issues },
		});
		expect(response).toBe(error);
	});

	it("sends other errors as thrown", async () => {
		const builtIn = new RequestValidationFailed({
			data: { body: [], query: [], params: [], headers: [] },
		});
		const gone = new RouteError("GONE", { status: 410, data: { id: 1 } });
		for (const error of [builtIn, gone]) {
			expect(await resolveRouteError(definition, error, false)).toEqual({
				error,
				response: error,
			});
		}
	});
});
