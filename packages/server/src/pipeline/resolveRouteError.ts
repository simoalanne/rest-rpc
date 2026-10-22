import { RouteError } from "@rest-rpc/core";
import type { RouteDeclaration } from "@rest-rpc/core/contract";
import { builtInCodes } from "./errors.ts";
import {
	validateResponseHeaders,
	validateResponseValue,
} from "./validation.ts";

/** The JSON body of an error response. */
export const errorBody = ({ code, message, data }: RouteError) =>
	data === undefined ? { code, message } : { code, message, data };

/**
 * Resolves a thrown error against the route's declaration: the declared
 * status applies and `data` and headers are validated. Built-in errors the
 * route does not declare are sent as thrown.
 *
 * @remarks Throws when the route does not declare the code, because the
 * error cannot be sent as part of the route's contract.
 */
export const resolveRouteError = async (
	route: RouteDeclaration,
	error: RouteError,
	disableValidation: boolean,
): Promise<RouteError> => {
	const declaration = route.errors?.[error.code];
	if (!declaration) {
		if (builtInCodes.has(error.code)) return error;
		throw new Error(
			`Route "${route.method} ${route.path}" threw undeclared error code "${error.code}".`,
			{ cause: error },
		);
	}

	try {
		const [data, headers] = disableValidation
			? [error.data, declaration.headers ? error.headers : undefined]
			: await Promise.all([
					validateResponseValue(declaration.data, error.data, "data"),
					validateResponseHeaders(declaration, error.headers),
				]);
		return new RouteError(error.code, {
			status: declaration.status,
			message: error.message,
			data,
			headers: headers ?? {},
			cause: error,
		});
	} catch (failure) {
		if (failure instanceof RouteError) return failure;
		throw failure;
	}
};
