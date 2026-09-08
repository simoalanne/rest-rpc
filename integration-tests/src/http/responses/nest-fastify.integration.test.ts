import { HttpAdapterHost } from "@nestjs/core";
import { createNestAdapter } from "../harness/nest.ts";
import { responsesContract } from "./contract.ts";
import { createResponsesHandlers } from "./handlers.ts";
import { ResponsesExceptionFilter } from "./nestExceptionFilter.ts";
import { runResponsesSuite } from "./suite.ts";

runResponsesSuite(
	createNestAdapter(responsesContract, createResponsesHandlers(), {
		configureApp: (app) => {
			app.useGlobalFilters(
				new ResponsesExceptionFilter(app.get(HttpAdapterHost)),
			);
		},
		platform: "fastify",
	}),
);
