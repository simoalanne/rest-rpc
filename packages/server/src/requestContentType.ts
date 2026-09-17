import type { RouteDeclaration } from "@rest-rpc/core/contract";
import { normalizeMediaType } from "@rest-rpc/core/codecs";

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
	const declared = route.request?.contentType;
	const accepted =
		declared === undefined
			? []
			: Array.isArray(declared)
				? declared
				: [declared];
	if (accepted.some((type) => normalizeMediaType(type) === mediaType)) {
		return undefined;
	}
	return { status: 415, message: "Unsupported request body content type." };
}
