import { route, type } from "@rest-rpc/core";
import { implement } from "./implement.ts";
import { call } from "../pipeline/call.ts";
import { respond } from "../pipeline/respond.ts";

const contract = {
	users: {
		get: route
			.get("/users/:id")
			.params(type<{ id: string }>())
			.response(type<{ name: string }>()),
	},
};

describe("implement", () => {
	it("should apply root middleware to every route without changing the contract", async () => {
		const calls: string[] = [];
		const implementation = implement(contract)
			.use(({ next }) => {
				calls.push("first");
				return next();
			})
			.use(({ next }) => {
				calls.push("second");
				return next();
			});
		const get = implementation.users.get.handler(({ params }) => ({
			name: params.id,
		}));
		expect(await call(get, { params: { id: "Ada" } })).toMatchObject({
			body: { name: "Ada" },
		});
		expect(calls).toEqual(["first", "second"]);

		const plain = implement(contract).users.get.handler(() => ({
			name: "Ada",
		}));
		await call(plain, { params: { id: "1" } });
		expect(calls).toEqual(["first", "second"]);
	});

	it("should reject contracts that already contain a handler", () => {
		const implementedRoute = implement(contract.users.get).handler(() =>
			respond({ name: "Ada" }),
		);

		expect(() => implement(implementedRoute)).toThrow();
	});

	it("should reject contracts that already contain middleware", () => {
		const implementedRoute = implement(contract.users.get).use(({ next }) =>
			next(),
		);

		expect(() => implement(implementedRoute)).toThrow();
	});
});
