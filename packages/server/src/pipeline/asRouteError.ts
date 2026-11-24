import { RouteError } from "@rest-rpc/core";
import { InternalServerError } from "./errors.ts";

/** The parts of an error response, as sent. */
export type ErrorResponse = {
	readonly code: string;
	readonly message: string;
	readonly status: number;
	readonly data: unknown;
	readonly headers: Readonly<Record<string, unknown>>;
	readonly cookies?: readonly string[];
};

/**
 * The error an app sends for a thrown value: a `RouteError` as it is, and
 * anything else as an internal error with the value as `cause`.
 */
export const asRouteError = (error: unknown): RouteError =>
	error instanceof RouteError
		? error
		: new InternalServerError({ cause: error });
