import {
	BadRequestException,
	InternalServerErrorException,
} from "@nestjs/common";
import type {
	RequestValidationError,
	ResponseValidationError,
} from "@rest-rpc/server";

/**
 * Nest HTTP exception raised when a request does not satisfy its route contract.
 *
 * @remarks The default status is 400 and `validationError` retains the
 * framework-neutral issues grouped by request location.
 *
 * @see {@link https://rest-rpc.dev/docs/server/nest#error-handling}
 */
export class RequestValidationException extends BadRequestException {
	/** The framework-neutral rest-rpc validation error. */
	readonly validationError: RequestValidationError;

	constructor(error: RequestValidationError) {
		super(error.responseBody, { cause: error });
		this.validationError = error;
	}
}

/**
 * Nest HTTP exception raised when handler output does not satisfy its route contract.
 *
 * @remarks The default status is 500 and its response body does not expose
 * validation details. Inspect `validationError` in an exception filter.
 *
 * @see {@link https://rest-rpc.dev/docs/server/nest#error-handling}
 */
export class ResponseValidationException extends InternalServerErrorException {
	/** The framework-neutral rest-rpc validation error. */
	readonly validationError: ResponseValidationError;

	constructor(error: ResponseValidationError) {
		super(error.responseBody, { cause: error });
		this.validationError = error;
	}
}
