import {
	Catch,
	type ArgumentsHost,
	type ExceptionFilter,
} from "@nestjs/common";
import { HttpAdapterHost } from "@nestjs/core";
import { RequestValidationException } from "@rest-rpc/nest";
import type { ErrorHandlerState } from "./state.ts";

@Catch()
export class ErrorHandlersExceptionFilter implements ExceptionFilter {
	constructor(
		private readonly adapterHost: HttpAdapterHost,
		private readonly state: ErrorHandlerState,
	) {}

	catch(error: unknown, host: ArgumentsHost) {
		const http = host.switchToHttp();
		const request = http.getRequest<{ url: string }>();
		const response = http.getResponse();
		const path = new URL(request.url, "http://localhost").pathname;

		if (error instanceof RequestValidationException) {
			this.state.validationErrors += 1;
			const issueCount = Object.values(error.validationError.issues).reduce(
				(count, issues) => count + issues.length,
				0,
			);

			this.adapterHost.httpAdapter.setHeader(
				response,
				"x-error-handler",
				"request-validation",
			);
			this.adapterHost.httpAdapter.reply(
				response,
				{
					code: "VALIDATION_ERROR",
					issueCount,
					path,
				},
				422,
			);
			return;
		}

		this.state.unhandledErrors += 1;
		this.adapterHost.httpAdapter.setHeader(
			response,
			"x-error-handler",
			"unhandled",
		);
		this.adapterHost.httpAdapter.reply(
			response,
			{
				code: "UNHANDLED_ERROR",
				message: error instanceof Error ? error.message : "unknown error",
				path,
			},
			503,
		);
	}
}
