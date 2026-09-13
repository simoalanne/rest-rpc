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
 * @see {@link https://rest-rpc.dev/docs/contract/schemas#validation}
 */
export class RequestValidationError extends Error {
	readonly name = "RequestValidationError";
	/** Standard Schema validation issues grouped by HTTP request location. */
	readonly issues: RequestValidationIssues;

	constructor(issues: RequestValidationIssues) {
		super("Request validation failed.");
		this.issues = issues;
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
 * @see {@link https://rest-rpc.dev/docs/contract/schemas#validation}
 */
export class ResponseValidationError extends Error {
	readonly name = "ResponseValidationError";
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
