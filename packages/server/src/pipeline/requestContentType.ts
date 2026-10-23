import type { RouteError } from "@rest-rpc/core";
import type { RuntimeImplementation } from "../routing/match.ts";
import { UnsupportedMediaType } from "./errors.ts";

/** Without a content type, a route with one body media type uses it, and a route with several requires one. */
export function resolveRequestMediaType(
	implementation: RuntimeImplementation,
	receivedMediaType: string,
): string | undefined | RouteError {
	if (receivedMediaType) {
		return receivedMediaType in (implementation.route.request?.body ?? {})
			? receivedMediaType
			: new UnsupportedMediaType();
	}
	return implementation.requiresBodyContentType
		? new UnsupportedMediaType({
				message: "Request body content type is required.",
			})
		: implementation.defaultBodyMediaType;
}
