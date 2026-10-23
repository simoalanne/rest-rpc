import { RouteError } from "@rest-rpc/core";
import type { RouteDeclaration } from "@rest-rpc/core/contract";
import {
	validateResponseHeaders,
	validateResponseValue,
} from "./validation.ts";

/**
 * Resolves a thrown error against the route's declaration: the declared
 * status applies and `data` and headers are validated. Errors the route does
 * not declare are sent as thrown.
 */
export const resolveRouteError = async (
	route: RouteDeclaration,
	error: RouteError,
	disableValidation: boolean,
): Promise<RouteError> => {
	const declaration = route.errors?.[error.code];
	if (!declaration) return error;

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
