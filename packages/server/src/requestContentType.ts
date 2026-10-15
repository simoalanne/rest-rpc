import type { RouteDeclaration } from "@rest-rpc/core/contract";
import {
	findDeclaredContentType,
	normalizeMediaType,
} from "@rest-rpc/core/codecs";

/**
 * Checks a received media type against a route's declared request body types.
 * Returns a transport rejection, or undefined when the header is accepted.
 * Missing headers pass; received types without a matching declaration are rejected.
 */
export function assertRequestContentType(
	route: RouteDeclaration,
	contentType: string | null | undefined,
): { status: 415; message: string } | undefined {
	const mediaType = normalizeMediaType(contentType);
	if (!mediaType) return undefined;
	if (
		findDeclaredContentType(route.request?.contentType, mediaType) !==
		undefined
	) {
		return undefined;
	}
	return { status: 415, message: "Unsupported request body content type." };
}
