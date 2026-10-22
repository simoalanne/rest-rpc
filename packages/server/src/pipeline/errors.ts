import { RouteError } from "@rest-rpc/core";
import type { StandardSchemaV1 } from "@rest-rpc/core/standard-schema";

/**
 * A Standard Schema validation issue surfaced by server request validation.
 *
 * @see {@link https://rest-rpc.vercel.app/docs/http-behavior/schemas#request-validation}
 */
export type ValidationIssue = StandardSchemaV1.Issue;

/**
 * Standard Schema validation issues grouped by HTTP request location, sent as
 * the `data` of `REQUEST_VALIDATION_FAILED` errors.
 *
 * @see {@link https://rest-rpc.vercel.app/docs/http-behavior/errors#built-in-errors}
 */
export type RequestValidationIssues = {
	body: readonly ValidationIssue[];
	query: readonly ValidationIssue[];
	params: readonly ValidationIssue[];
	headers: readonly ValidationIssue[];
};

/** Where a server response failed validation, kept in the error's `cause`. */
export type ResponseValidationLocation = "body" | "headers" | "stream" | "data";

export const requestValidationFailed = (issues: RequestValidationIssues) =>
	new RouteError("REQUEST_VALIDATION_FAILED", {
		message: "Request validation failed.",
		data: issues,
	});

export const malformedRequestBody = () =>
	new RouteError("MALFORMED_REQUEST_BODY", {
		message: "Invalid request body.",
	});

export const unsupportedMediaType = (message: string) =>
	new RouteError("UNSUPPORTED_MEDIA_TYPE", { status: 415, message });

// Issues stay in `cause`, which is never sent.
export const responseValidationFailed = (
	location: ResponseValidationLocation,
	issues: readonly ValidationIssue[],
) =>
	new RouteError("RESPONSE_VALIDATION_FAILED", {
		status: 500,
		message: "Response validation failed.",
		cause: { location, issues },
	});

export const internalServerError = (cause: unknown) =>
	new RouteError("INTERNAL_SERVER_ERROR", {
		status: 500,
		message: "Internal server error.",
		cause,
	});

export const notFound = () =>
	new RouteError("NOT_FOUND", { status: 404, message: "Not found." });

export const builtInCodes: ReadonlySet<string> = new Set([
	"REQUEST_VALIDATION_FAILED",
	"MALFORMED_REQUEST_BODY",
	"UNSUPPORTED_MEDIA_TYPE",
	"RESPONSE_VALIDATION_FAILED",
	"INTERNAL_SERVER_ERROR",
	"NOT_FOUND",
]);
