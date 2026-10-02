import "reflect-metadata";
import { Controller, Module, Query, SetMetadata } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { route as contractRoute, type } from "@rest-rpc/core";
import type { StandardSchemaV1 } from "@rest-rpc/core/standard-schema";
import { Implement, RestRpcModule, implement } from "@rest-rpc/nest";
import type { AddressInfo } from "node:net";

const invalid: StandardSchemaV1<unknown, string> = {
	"~standard": {
		version: 1,
		vendor: "test",
		validate: () => ({ issues: [{ message: "private validation detail" }] }),
	},
};
const contract = {
	users: {
		get: contractRoute
			.get("/users/{id}")
			.params(type<{ id: string }>())
			.response(200, type<{ id: string; name: string }>()),
	},
	input: contractRoute.post("/invalid-input").body(invalid).response(204),
	output: contractRoute.get("/invalid-output").response(200, invalid),
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
			input: handlers.input.handler(() => ({ status: 204 })),
			output: handlers.output.handler(() => ({
				status: 200,
				body: "private output",
			})),
		};
	}
}
@Module({ imports: [RestRpcModule.forRoot()], controllers: [ApiController] })
class ApiModule {}

describe("Nest HTTP integration", () => {
	it("runs decorators, module, interceptor, and validation exceptions over HTTP", async () => {
		const app = await NestFactory.create(ApiModule, { logger: false });
		try {
			await app.listen(0, "127.0.0.1");
			const url = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}`;
			const response = await fetch(`${url}/users/42?prefix=argument`);
			expect(response.status).toBe(200);
			expect(await response.json()).toEqual({ id: "42", name: "Ada" });
			const badInput = await fetch(`${url}/invalid-input?prefix=argument`, {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: '{"invalid":true}',
			});
			expect(badInput.status).toBe(400);
			expect(await badInput.json()).toMatchObject({
				validationErrors: {
					body: [{ message: "private validation detail" }],
				},
			});
			const badOutput = await fetch(`${url}/invalid-output?prefix=argument`);
			expect(badOutput.status).toBe(500);
			expect(await badOutput.json()).toEqual({
				message: "Response validation failed.",
			});
		} finally {
			await app.close();
		}
	});
});
