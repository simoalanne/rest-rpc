import "reflect-metadata";
import {
	type ArgumentsHost,
	Catch,
	Controller,
	type ExceptionFilter,
	Module,
} from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import type { Contract } from "@rest-rpc/core/contract";
import {
	Implement,
	RequestValidationException,
	ResponseValidationException,
	RestRpcModule,
} from "@rest-rpc/nest";
import type { Response } from "express";
import type { AddressInfo } from "node:net";
import { describeAdapterConformance } from "../../server/tests/adapterSuite.ts";

@Catch(RequestValidationException, ResponseValidationException)
class CustomValidationFilter implements ExceptionFilter {
	catch(exception: unknown, host: ArgumentsHost) {
		const response = host.switchToHttp().getResponse<Response>();
		if (exception instanceof RequestValidationException) {
			response.status(422).json({ handled: "request" });
		} else {
			response.status(502).json({ handled: "response" });
		}
	}
}

describeAdapterConformance("nest", {
	capabilities: {
		requestBodyLimit: false,
	},
	serve: async (routes, options, run) => {
		// Server-first routes double as the contract and their own implementation.
		@Controller()
		class ConformanceController {
			@Implement(routes as Contract)
			routes() {
				return routes;
			}
		}
		@Module({
			imports: [RestRpcModule.forRoot()],
			controllers: [ConformanceController],
		})
		class ConformanceModule {}

		const app = await NestFactory.create(ConformanceModule, { logger: false });
		if (options.customValidationHandlers) {
			app.useGlobalFilters(new CustomValidationFilter());
		}
		try {
			await app.listen(0, "127.0.0.1");
			const { port } = app.getHttpServer().address() as AddressInfo;
			await run(`http://127.0.0.1:${port}`);
		} finally {
			await app.close();
		}
	},
});
