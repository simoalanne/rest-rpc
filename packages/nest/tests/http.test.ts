import "reflect-metadata";
import { Controller, Module, Query, SetMetadata } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { route as contractRoute, type } from "@rest-rpc/core";
import { Implement, RestRpcModule, implement } from "@rest-rpc/nest";
import type { AddressInfo } from "node:net";

const contract = {
	users: {
		get: contractRoute
			.get("/users/{id}")
			.params(type<{ id: string }>())
			.response(200, type<{ id: string; name: string }>()),
	},
	derived: contractRoute.get().response(200, type<{ derived: boolean }>()),
};

@Controller()
class ApiController {
	name = "Ada";

	@Implement(contract)
	@SetMetadata("marker", "copied")
	routes(@Query("prefix") prefix: string) {
		expect(prefix).toBe("argument");
		const handlers = implement(contract);
		return {
			users: {
				get: handlers.users.get.handler(
					({ params, executionContext, signal }) => {
						expect(executionContext.getClass()).toBe(ApiController);
						expect(
							Reflect.getMetadata("marker", executionContext.getHandler()),
						).toBe("copied");
						expect(signal).toBeInstanceOf(AbortSignal);
						return { status: 200, body: { id: params.id, name: this.name } };
					},
				),
			},
			derived: handlers.derived.handler(() => ({
				status: 200,
				body: { derived: true },
			})),
		};
	}
}
@Module({ imports: [RestRpcModule.forRoot()], controllers: [ApiController] })
class ApiModule {}

describe("Nest HTTP integration", () => {
	it("runs decorators, module, and interceptor over HTTP", async () => {
		const app = await NestFactory.create(ApiModule, { logger: false });
		try {
			await app.listen(0, "127.0.0.1");
			const url = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}`;
			const response = await fetch(`${url}/users/42?prefix=argument`);
			expect(response.status).toBe(200);
			expect(await response.json()).toEqual({ id: "42", name: "Ada" });
			const derived = await fetch(`${url}/derived?prefix=argument`);
			expect(derived.status).toBe(200);
			expect(await derived.json()).toEqual({ derived: true });
		} finally {
			await app.close();
		}
	});

	it("rejects a root route whose path is derived from tree keys", () => {
		const decorate = Implement(
			contractRoute.get().response(200, type<string>()),
		);
		expect(() =>
			decorate(ApiController.prototype, "routes", {
				value: () => undefined,
			}),
		).toThrow("@Implement() cannot derive a path");
	});
});
