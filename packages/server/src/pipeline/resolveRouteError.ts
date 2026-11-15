import { RouteError } from "@rest-rpc/core";
import type { RouteDefinition } from "@rest-rpc/core/contract";
import type { MaybePromise } from "@rest-rpc/core/utils";
import { allMaybePromise, mapMaybePromise } from "./maybePromise.ts";
import {
	validateResponseHeaders,
	validateResponseValue,
} from "./validation.ts";

/** The parts of an error response, as sent. */
export type ErrorResponse = {
	readonly code: string;
	readonly message: string;
	readonly status: number;
	readonly data: unknown;
	readonly headers: Readonly<Record<string, unknown>>;
	readonly cookies?: readonly string[];
};

/** An error to observe and the response it is sent as. */
export type ResolvedRouteError = {
	/** The thrown error, or the internal error a validation failure becomes. */
	error: RouteError;
	response: ErrorResponse;
};

const asSent = (error: RouteError): ResolvedRouteError => ({
	error,
	response: error,
});

// A `RouteError` from validation replaces the thrown error; others propagate.
const toValidationFailure = (failure: unknown): ResolvedRouteError => {
	if (failure instanceof RouteError) return asSent(failure);
	throw failure;
};

/**
 * Applies the route's definition of the error's code: the defined status, and
 * `data` and headers validated against its schemas. The thrown error is left
 * as is, and other errors are sent as thrown. Synchronous when the schemas are.
 */
export const resolveRouteError = (
	route: RouteDefinition,
	error: RouteError,
	disableValidation: boolean,
): MaybePromise<ResolvedRouteError> => {
	const definition = route.errors?.[error.code];
	if (!definition) return asSent(error);

	const toResolved = ([data, headers]: readonly [
		unknown,
		Record<string, unknown> | undefined,
	]): ResolvedRouteError => ({
		error,
		response: {
			code: error.code,
			message: error.message,
			status: definition.status,
			data,
			headers: headers ?? {},
			cookies: error.cookies,
		},
	});
	if (disableValidation) {
		return toResolved([
			error.data,
			definition.headers ? error.headers : undefined,
		]);
	}

	let resolved: MaybePromise<ResolvedRouteError>;
	try {
		resolved = mapMaybePromise(
			allMaybePromise([
				validateResponseValue(definition.data, error.data, "data"),
				validateResponseHeaders(definition.headers, error.headers),
			] as const),
			toResolved,
		);
	} catch (failure) {
		return toValidationFailure(failure);
	}
	return resolved instanceof Promise
		? resolved.catch(toValidationFailure)
		: resolved;
};
