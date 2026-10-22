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
const declaration = route.get("/users/:id").error(UserNotFound)["~restrpc"];

describe("resolveRouteError", () => {
	it("applies the declaration and validates data and headers unless disabled", async () => {
		const thrown = new RouteError("USER_NOT_FOUND", {
			message: "Missing",
			data: 1,
			headers: { "x-id": 1 },
		});
		expect(await resolveRouteError(declaration, thrown, false)).toMatchObject({
			code: "USER_NOT_FOUND",
			status: 404,
			message: "Missing",
			data: { id: "1" },
			headers: { "x-id": "1" },
			cause: thrown,
		});
		expect(await resolveRouteError(declaration, thrown, true)).toMatchObject({
			status: 404,
			data: 1,
			headers: { "x-id": 1 },
		});
	});

	it("turns invalid data into a response validation failure", async () => {
		const issues = [{ message: "invalid" }];
		const invalid: StandardSchemaV1 = {
			"~standard": { version: 1, vendor: "test", validate: () => ({ issues }) },
		};
		const Invalid = routeError("INVALID", { data: invalid });
		const resolved = await resolveRouteError(
			route.error(Invalid)["~restrpc"],
			new Invalid("value"),
			false,
		);
		expect(resolved).toMatchObject({
			code: "INTERNAL_SERVER_ERROR",
			status: 500,
			cause: { location: "data", issues },
		});
	});

	it("passes undeclared built-in errors and rejects other undeclared codes", async () => {
		const builtIn = new RequestValidationFailed({
			body: [],
			query: [],
			params: [],
			headers: [],
		});
		expect(await resolveRouteError(declaration, builtIn, false)).toBe(builtIn);
		await expect(
			resolveRouteError(declaration, new RouteError("GONE"), false),
		).rejects.toThrow(
			'Route "GET /users/:id" threw undeclared error code "GONE".',
		);
	});
});
