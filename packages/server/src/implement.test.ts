import { route, type } from "@rest-rpc/core";
import { implement } from "./implement.ts";
import type { RuntimeServerRoute } from "./routeBuilder.types.ts";

const contract = {
	users: {
		get: route
			.get("/users/{id}")
			.params(type<{ id: string }>())
			.response(200, type<{ name: string }>()),
	},
};

const routeState = (value: unknown) =>
	(value as RuntimeServerRoute)["~restrpc"];

describe("implement", () => {
	it("should apply root middleware to every route without mutating the contract", () => {
		const middleware1 = () => "first";
		const middleware2 = () => "second";
		const implementation = implement(contract)
			.use(middleware1)
			.use(middleware2);

		expect(implementation.users.get).not.toBe(contract.users.get);
		expect(routeState(implementation.users.get).middleware).toEqual([
			middleware1,
			middleware2,
		]);
		expect(routeState(contract.users.get).middleware).toBeUndefined();
	});

	it("should reject contracts that already contain a handler", () => {
		const implementedRoute = implement(contract.users.get).handler(() => ({
			status: 200,
			body: { name: "Ada" },
		}));

		expect(() => implement(implementedRoute)).toThrow(
			"Cannot implement a route that already has a handler.",
		);
	});

	it("should reject contracts that already contain middleware", () => {
		const implementedRoute = implement(contract.users.get).use(() => {});

		expect(() => implement(implementedRoute)).toThrow(
			"Cannot implement a route that already has middleware.",
		);
	});
});
