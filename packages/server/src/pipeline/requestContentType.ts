import type { RouteDeclaration } from "@rest-rpc/core/contract";
import { normalizeMediaType } from "@rest-rpc/core/codecs";

type RequestMediaType =
	| { mediaType: string | undefined; rejection: undefined }
	| { mediaType: undefined; rejection: { status: 415; message: string } };

const unsupported = (message: string): RequestMediaType => ({
	mediaType: undefined,
	rejection: { status: 415, message },
});

/**
 * Selects the declared body media type for a received content type.
 *
 * @remarks Received media types without a matching declaration are rejected.
 * Without a content type, a route with one body media type uses it, and a
 * route with several requires one.
 */
export function resolveRequestMediaType(
	route: RouteDeclaration,
	contentType: string | null | undefined,
): RequestMediaType {
	const body = route.request?.body ?? {};
	const mediaType = normalizeMediaType(contentType);
	if (mediaType) {
		return mediaType in body
			? { mediaType, rejection: undefined }
			: unsupported("Unsupported request body content type.");
	}

	const declared = Object.keys(body);
	if (declared.length > 1) {
		return unsupported("Request body content type is required.");
	}
	return { mediaType: declared[0], rejection: undefined };
}
