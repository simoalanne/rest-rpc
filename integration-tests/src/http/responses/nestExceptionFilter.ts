import {
	Catch,
	type ArgumentsHost,
	type ExceptionFilter,
} from "@nestjs/common";
import { HttpAdapterHost } from "@nestjs/core";
import { ResponseValidationException } from "@rest-rpc/nest";

@Catch()
export class ResponsesExceptionFilter implements ExceptionFilter {
	constructor(private readonly adapterHost: HttpAdapterHost) {}

	catch(error: unknown, host: ArgumentsHost) {
		const http = host.switchToHttp();
		const request = http.getRequest<{ url: string }>();
		const response = http.getResponse();
		const path = new URL(request.url, "http://localhost").pathname;

		if (error instanceof ResponseValidationException) {
			this.adapterHost.httpAdapter.setHeader(
				response,
				"x-error-handler",
				"response-validation",
			);
			this.adapterHost.httpAdapter.reply(
				response,
				{
					code: "INVALID_RESPONSE",
					path,
				},
				500,
			);
			return;
		}

		this.adapterHost.httpAdapter.reply(
			response,
			{
				code: "TEAPOT",
				message: error instanceof Error ? error.message : "unknown error",
			},
			418,
		);
	}
}
