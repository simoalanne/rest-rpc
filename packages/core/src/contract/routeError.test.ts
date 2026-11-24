import { type } from "../standard-schema/type.ts";
import {
	InternalServerError,
	isDefinedError,
	markDefined,
	RouteError,
	routeError,
} from "./routeError.ts";

describe("routeError", () => {
	it("creates RouteError subclasses that carry their definition", () => {
		const data = type<{ id: string }>();
		const UserNotFound = routeError("USER_NOT_FOUND", {
			status: 404,
			data,
			message: "User not found",
		});
		expect({ ...UserNotFound }).toMatchObject({
			code: "USER_NOT_FOUND",
			status: 404,
			data,
			message: "User not found",
		});

		const cause = new Error("missing row");
		const error = new UserNotFound({ data: { id: "1" }, cause });
		expect(error).toBeInstanceOf(RouteError);
		expect(error).toMatchObject({
			name: "RouteError",
			code: "USER_NOT_FOUND",
			status: 404,
			message: "User not found",
			data: { id: "1" },
			headers: {},
			cause,
		});
		expect(
			new UserNotFound({ data: { id: "1" }, message: "Gone" }).message,
		).toBe("Gone");
	});

	it("defaults to status 400 and the code as message, without data", () => {
		const Invalid = routeError("INVALID");
		expect(new Invalid()).toMatchObject({
			status: 400,
			message: "INVALID",
			data: undefined,
		});
	});

	it.each([
		["TOO_LOW", 399],
		["TOO_HIGH", 600],
	])("rejects the definition %s with status %s", (code, status) => {
		expect(() => routeError(code, { status })).toThrow();
	});

	it("holds the output of its data and headers schemas", () => {
		const UserNotFound = routeError("USER_NOT_FOUND", {
			status: 404,
			data: type((id: number) => ({ id: String(id) })),
			headers: type((input: { "x-id": number }) => ({
				"x-id": `${input["x-id"]}`,
			})),
		});
		expect(new UserNotFound({ data: 1, headers: { "x-id": 1 } })).toMatchObject(
			{ data: { id: "1" }, headers: { "x-id": "1" } },
		);
	});

	it("throws an internal error with the issues for invalid data", () => {
		const issues = [{ message: "invalid" }];
		const Invalid = routeError("INVALID", {
			data: {
				"~standard": {
					version: 1,
					vendor: "test",
					validate: () => ({ issues }),
				},
			},
		});
		let thrown: unknown;
		try {
			new Invalid({ data: "value" });
		} catch (error) {
			thrown = error;
		}
		expect(thrown).toBeInstanceOf(InternalServerError);
		expect(thrown).toMatchObject({ cause: { location: "data", issues } });
	});

	it("rejects asynchronous schemas", () => {
		const Async = routeError("ASYNC", {
			data: type(async (value: number) => value),
		});
		expect(() => new Async({ data: 1 })).toThrow();
	});
});

describe("isDefinedError", () => {
	it("checks for RouteErrors marked as defined", () => {
		const Gone = routeError("GONE", { status: 410 });
		expect(isDefinedError(markDefined(new Gone()))).toBe(true);
		expect(isDefinedError(new Gone())).toBe(false);
		expect(isDefinedError(new Error("offline"))).toBe(false);
		expect(isDefinedError({ code: "GONE", isDefined: true })).toBe(false);
	});
});
