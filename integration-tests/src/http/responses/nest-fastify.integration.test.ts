import { HttpAdapterHost } from "@nestjs/core";
import { createNestAdapter } from "../harness/nest.ts";
import { responsesContract } from "./contract.ts";
import { createResponsesImplementations } from "./handlers.ts";
import { ResponsesExceptionFilter } from "./nestExceptionFilter.ts";
import { runResponsesSuite } from "./suite.ts";

runResponsesSuite(
	createNestAdapter(responsesContract, createResponsesImplementations(), {
		configureApp: (app) => {
			app.useGlobalFilters(
				new ResponsesExceptionFilter(app.get(HttpAdapterHost)),
			);
		},
		platform: "fastify",
	}),
);
