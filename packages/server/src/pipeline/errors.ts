import { routeError, type, type RouteError } from "@rest-rpc/core";
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

/**
 * The built-in error sent when request validation fails, with the issues as
 * its `data`.
 *
 * @remarks Declare it with `.error()` to make clients recognize it.
 *
 * @see {@link https://rest-rpc.vercel.app/docs/http-behavior/errors#built-in-errors}
 */
export const RequestValidationFailed = routeError("REQUEST_VALIDATION_FAILED", {
	status: 400,
	message: "Request validation failed.",
	data: type<RequestValidationIssues>(),
});

/**
 * The built-in error sent when the request body cannot be decoded.
 *
 * @remarks Declare it with `.error()` to make clients recognize it.
 *
 * @see {@link https://rest-rpc.vercel.app/docs/http-behavior/errors#built-in-errors}
 */
export const MalformedRequestBody = routeError("MALFORMED_REQUEST_BODY", {
	status: 400,
	message: "Invalid request body.",
});

/**
 * The built-in error sent when the request `Content-Type` is not declared, or
 * missing when the route declares several media types.
 *
 * @remarks Declare it with `.error()` to make clients recognize it.
 *
 * @see {@link https://rest-rpc.vercel.app/docs/http-behavior/errors#built-in-errors}
 */
export const UnsupportedMediaType = routeError("UNSUPPORTED_MEDIA_TYPE", {
	status: 415,
	message: "Unsupported request body content type.",
});

/**
 * The built-in error sent when a response fails validation, and by
 * `createApp` for other thrown errors. Its `cause` holds the reason and is
 * never sent.
 *
 * @remarks Declare it with `.error()` to make clients recognize it.
 *
 * @see {@link https://rest-rpc.vercel.app/docs/http-behavior/errors#built-in-errors}
 */
export const InternalServerError = routeError("INTERNAL_SERVER_ERROR", {
	status: 500,
	message: "Internal server error.",
});

/**
 * The built-in error `createApp` sends by default for requests that match no
 * route.
 *
 * @remarks Declare it with `.error()` to make clients recognize it.
 *
 * @see {@link https://rest-rpc.vercel.app/docs/http-behavior/errors#built-in-errors}
 */
export const NotFound = routeError("NOT_FOUND", {
	status: 404,
	message: "Not found.",
});

// An invalid response is a server bug, so clients receive an internal error.
// Issues stay in `cause`, which is never sent.
export const responseValidationFailed = (
	location: ResponseValidationLocation,
	issues: readonly ValidationIssue[],
) => new InternalServerError({ cause: { location, issues } });

const ignore = () => {};

// Observers cannot change the response, so their failures are ignored.
export const observeError = (
	onError: ((error: RouteError, request: Request) => void) | undefined,
	error: RouteError,
	request: Request,
) => {
	if (!onError) return;
	try {
		const result: unknown = onError(error, request);
		if (result instanceof Promise) result.catch(ignore);
	} catch {
		// Ignored, like a rejected observer.
	}
};
