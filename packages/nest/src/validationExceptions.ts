import {
	BadRequestException,
	InternalServerErrorException,
} from "@nestjs/common";
import type {
	RequestValidationError,
	ResponseValidationError,
} from "@rest-rpc/server";

/** Nest HTTP exception raised when a request does not satisfy its route contract. */
export class RequestValidationException extends BadRequestException {
	/** The framework-neutral rest-rpc validation error. */
	readonly validationError: RequestValidationError;

	constructor(error: RequestValidationError) {
		super(
			{
				message:
					"Request validation failed. Check the validationErrors field for details.",
				validationErrors: error.issues,
			},
			{ cause: error },
		);
		this.validationError = error;
	}
}

/** Nest HTTP exception raised when a response does not satisfy its route contract. */
export class ResponseValidationException extends InternalServerErrorException {
	/** The framework-neutral rest-rpc validation error. */
	readonly validationError: ResponseValidationError;

	constructor(error: ResponseValidationError) {
		super({ message: "Response validation failed." }, { cause: error });
		this.validationError = error;
	}
}
