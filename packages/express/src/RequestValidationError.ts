export type ValidationIssue = {
	code: string;
	message: string;
	path: PropertyKey[];
};

export type RequestValidationErrorDetails = {
	message: string;
	validationErrors: ValidationIssue[];
};

export class RequestValidationError extends Error {
	override readonly name = "RequestValidationError";
	readonly statusCode = 400;
	readonly validationErrors: ValidationIssue[];

	constructor(details: RequestValidationErrorDetails) {
		super(details.message);
		this.validationErrors = details.validationErrors;
	}
}

export default RequestValidationError;
