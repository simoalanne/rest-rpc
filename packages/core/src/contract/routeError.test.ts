import { type } from "../standard-schema/type.ts";
import {
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
		expect(new Invalid()).not.toHaveProperty("cause");
	});

	it.each([
		["TOO_LOW", 399, 'Error status "399" must be from 400 to 599.'],
		["TOO_HIGH", 600, 'Error status "600" must be from 400 to 599.'],
	])("rejects the definition %s with status %s", (code, status, message) => {
		expect(() => routeError(code, { status })).toThrow(message);
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
