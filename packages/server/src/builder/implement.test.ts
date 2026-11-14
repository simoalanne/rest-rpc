import { route, type } from "@rest-rpc/core";
import { implement } from "./implement.ts";
import { respond } from "../pipeline/respond.ts";
import type { ServerRouteBuilderState } from "./routeBuilder.types.ts";

const contract = {
	users: {
		get: route
			.get("/users/:id")
			.params(type<{ id: string }>())
			.response(type<{ name: string }>()),
	},
};

const routeState = (value: unknown) =>
	(value as { "~restrpc": ServerRouteBuilderState })["~restrpc"];

describe("implement", () => {
	it("should apply root middleware to every route without mutating the contract", () => {
		const middleware1 = () => respond("first");
		const middleware2 = () => respond("second");
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

	it("should attach handlers to nested contract routes", () => {
		const handler = () => respond({ name: "Ada" }, { status: 200 });
		const implementedRoute = implement(contract).users.get.handler(handler);

		expect(routeState(implementedRoute).handler).toBe(handler);
		expect(routeState(contract.users.get).handler).toBeUndefined();
	});

	it("should reject contracts that already contain a handler", () => {
		const implementedRoute = implement(contract.users.get).handler(() =>
			respond({ name: "Ada" }),
		);

		expect(() => implement(implementedRoute)).toThrow(
			"Cannot implement a route that already has a handler.",
		);
	});

	it("should reject contracts that already contain middleware", () => {
		const implementedRoute = implement(contract.users.get).use(({ next }) =>
			next(),
		);

		expect(() => implement(implementedRoute)).toThrow(
			"Cannot implement a route that already has middleware.",
		);
	});
});
