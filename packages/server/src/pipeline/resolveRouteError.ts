import { RouteError } from "@rest-rpc/core";
import type { RouteDefinition } from "@rest-rpc/core/contract";
import {
	validateResponseHeaders,
	validateResponseValue,
} from "./validation.ts";

/** Applies the defined status and validates `data` and headers; other errors are sent as thrown. */
export const resolveRouteError = async (
	route: RouteDefinition,
	error: RouteError,
	disableValidation: boolean,
): Promise<RouteError> => {
	const definition = route.errors?.[error.code];
	if (!definition) return error;

	try {
		const [data, headers] = disableValidation
			? [error.data, definition.headers ? error.headers : undefined]
			: await Promise.all([
					validateResponseValue(definition.data, error.data, "data"),
					validateResponseHeaders(definition.headers, error.headers),
				]);
		return new RouteError(error.code, {
			status: definition.status,
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
