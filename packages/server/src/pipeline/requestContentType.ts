import { RouteError } from "@rest-rpc/core";
import { normalizeMediaType } from "@rest-rpc/core/codecs";
import { UnsupportedMediaType } from "./errors.ts";

/**
 * The media type of a request body: the `content-type` its validated headers
 * declare, or else JSON, which a body without a content type is too.
 */
export function resolveRequestMediaType(
	declared: unknown,
	receivedMediaType: string,
): string | RouteError {
	if (typeof declared === "string") return normalizeMediaType(declared);
	return !receivedMediaType || receivedMediaType === "application/json"
		? "application/json"
		: new UnsupportedMediaType();
}
