import { HttpAdapterHost } from "@nestjs/core";
import { createNestAdapter } from "../harness/nest.ts";
import { responseValidationContract } from "./contract.ts";
import { ResponseValidationExceptionFilter } from "./nestExceptionFilter.ts";
import { createResponseValidationImplementations } from "./handlers.ts";
import { runResponseValidationSuite } from "./suite.ts";

runResponseValidationSuite(
	createNestAdapter(
		responseValidationContract,
		createResponseValidationImplementations(),
		{
			configureApp: (app) => {
				app.useGlobalFilters(
					new ResponseValidationExceptionFilter(app.get(HttpAdapterHost)),
				);
			},
		},
	),
);
