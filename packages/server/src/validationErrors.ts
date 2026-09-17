import type { ValidationIssue } from "./validation.ts";

/** Standard Schema validation issues grouped by HTTP request location. */
export type RequestValidationIssues = {
	body: readonly ValidationIssue[];
	query: readonly ValidationIssue[];
	params: readonly ValidationIssue[];
	headers: readonly ValidationIssue[];
};

/**
 * Error reported when an HTTP request does not satisfy its route contract.
 *
 * @remarks Server adapters handle this error before the route handler runs and
 * expose adapter-specific hooks for replacing the default error response.
 *
 * @see {@link https://rest-rpc.dev/docs/http-behavior/schemas#request-validation}
 */
export class RequestValidationError extends Error {
	readonly name = "RequestValidationError";
	/** Default HTTP status for request validation failures. */
	readonly status = 400;
	/** Default JSON response for request validation failures. */
	readonly responseBody: {
		message: string;
		validationErrors: RequestValidationIssues;
	};
	/** Standard Schema validation issues grouped by HTTP request location. */
	readonly issues: RequestValidationIssues;

	constructor(issues: RequestValidationIssues) {
		super("Request validation failed.");
		this.issues = issues;
		this.responseBody = {
			message:
				"Request validation failed. Check the validationErrors field for details.",
			validationErrors: issues,
		};
	}
}

/** The HTTP response location whose schema validation failed. */
export type ResponseValidationLocation = "body" | "headers" | "stream";

/**
 * Error reported when handler output does not satisfy its route contract.
 *
 * @remarks Server adapters expose adapter-specific hooks for replacing the
 * default error response.
 *
 * @see {@link https://rest-rpc.dev/docs/http-behavior/schemas#request-validation}
 */
export class ResponseValidationError extends Error {
	readonly name = "ResponseValidationError";
	/** Default HTTP status for response validation failures. */
	readonly status = 500;
	/** Default JSON response, without exposing response validation details. */
	readonly responseBody = { message: "Response validation failed." };
	/** The response location whose schema validation failed. */
	readonly location: ResponseValidationLocation;
	/** The Standard Schema validation issues. */
	readonly issues: readonly ValidationIssue[];

	constructor(
		location: ResponseValidationLocation,
		issues: readonly ValidationIssue[],
	) {
		super("Response validation failed.");
		this.location = location;
		this.issues = issues;
	}
}
