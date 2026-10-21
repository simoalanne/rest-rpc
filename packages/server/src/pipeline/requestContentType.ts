import type { RuntimeImplementation } from "../routing/match.ts";

/** Rejects a request body whose media type cannot be selected. */
export type RequestMediaTypeRejection = { status: 415; message: string };

const unsupportedContentType: RequestMediaTypeRejection = {
	status: 415,
	message: "Unsupported request body content type.",
};

const requiredContentType: RequestMediaTypeRejection = {
	status: 415,
	message: "Request body content type is required.",
};

/**
 * Selects the declared body media type for a received base media type.
 *
 * @remarks Received media types without a matching declaration are rejected.
 * Without a content type, a route with one body media type uses it, and a
 * route with several requires one.
 */
export function resolveRequestMediaType(
	implementation: RuntimeImplementation,
	receivedMediaType: string,
): string | undefined | RequestMediaTypeRejection {
	if (receivedMediaType) {
		return receivedMediaType in (implementation.route.request?.body ?? {})
			? receivedMediaType
			: unsupportedContentType;
	}
	return implementation.requiresBodyContentType
		? requiredContentType
		: implementation.defaultBodyMediaType;
}
